// @flow
/*
    Pillar Wallet: the personal data locker
    Copyright (C) 2019 Stiftung Pillar Project

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
*/

import {
  ADD_ACCOUNT,
  UPDATE_ACCOUNTS,
  ACCOUNT_TYPES,
} from 'constants/accountsConstants';
import { SMART_WALLET_UPGRADE_STATUSES } from 'constants/smartWalletConstants';
import { fetchAssetsBalancesAction } from 'actions/assetsActions';
import { fetchCollectiblesAction } from 'actions/collectiblesActions';
import { saveDbAction } from 'actions/dbActions';
import {
  connectSmartWalletAccountAction,
  initSmartWalletSdkAction,
  setSmartWalletUpgradeStatusAction,
  fetchVirtualAccountBalanceAction,
} from 'actions/smartWalletActions';
import { UPDATE_BALANCES } from 'constants/assetsConstants';
import { SET_HISTORY } from 'constants/historyConstants';
import { SET_COLLECTIBLES_TRANSACTION_HISTORY, UPDATE_COLLECTIBLES } from 'constants/collectiblesConstants';
import Storage from 'services/storage';
import { migrateBalancesToAccountsFormat } from 'services/dataMigration/balances';
import { migrateTxHistoryToAccountsFormat } from 'services/dataMigration/history';
import { migrateCollectiblesToAccountsFormat } from 'services/dataMigration/collectibles';
import { migrateCollectiblesHistoryToAccountsFormat } from 'services/dataMigration/collectiblesHistory';
import { getActiveAccountType, getActiveAccountId } from 'utils/accounts';
import { sdkConstants } from '@archanova/sdk';

const storage = Storage.getInstance('db');

export const initDefaultAccountAction = (walletAddress: string, walletId: string, migrateData: boolean = true) => {
  return async (dispatch: Function) => {
    const { balances = {} } = await storage.get('balances');
    const { history = {} } = await storage.get('history');
    const { collectibles = {} } = await storage.get('collectibles');
    const { collectiblesHistory = {} } = await storage.get('collectiblesHistory');

    const keyBasedAccount = {
      id: walletAddress,
      type: ACCOUNT_TYPES.KEY_BASED,
      isActive: true,
      walletId,
    };
    dispatch({
      type: ADD_ACCOUNT,
      payload: keyBasedAccount,
    });
    await dispatch(saveDbAction('accounts', { accounts: [keyBasedAccount] }, true));

    // data migration is optional
    if (!migrateData) {
      return Promise.resolve();
    }

    /*
     * Data migration
     */

    // balances
    if (!balances[walletAddress]) {
      const migratedBalances = migrateBalancesToAccountsFormat(balances, [keyBasedAccount]);
      if (migratedBalances) {
        dispatch({ type: UPDATE_BALANCES, payload: migratedBalances });
        await dispatch(saveDbAction('balances', { balances: migratedBalances }, true));
      }
    }

    // history
    if (Array.isArray(history)) {
      const migratedHistory = migrateTxHistoryToAccountsFormat(history, [keyBasedAccount]);
      if (migratedHistory) {
        dispatch({ type: SET_HISTORY, payload: migratedHistory });
        await dispatch(saveDbAction('history', { history: migratedHistory }, true));
      }
    }

    // collectibles
    if (Array.isArray(collectibles)) {
      const migratedCollectibles = migrateCollectiblesToAccountsFormat(collectibles, [keyBasedAccount]);
      if (migratedCollectibles) {
        dispatch({ type: UPDATE_COLLECTIBLES, payload: migratedCollectibles });
        await dispatch(saveDbAction('collectibles', { collectibles: migratedCollectibles }, true));
      }
    }

    // collectibles history
    if (Array.isArray(collectiblesHistory)) {
      const migratedCollectiblesHistory = migrateCollectiblesHistoryToAccountsFormat(
        collectiblesHistory,
        [keyBasedAccount],
      );
      if (migratedCollectiblesHistory) {
        dispatch({ type: SET_COLLECTIBLES_TRANSACTION_HISTORY, payload: migratedCollectiblesHistory });
        await dispatch(saveDbAction('collectiblesHistory', { collectiblesHistory: migratedCollectiblesHistory }, true));
      }
    }

    return Promise.resolve();
  };
};

export const addNewAccountAction = (
  accountAddress: string,
  type: string,
  accountExtra?: Object = {},
  backendAccounts: Object[] = [],
) => {
  return async (dispatch: Function, getState: Function) => {
    const { accounts: { data: accounts } } = getState();
    const smartWalletAccount = {
      id: accountAddress,
      type,
      extra: accountExtra,
      isActive: false,
      walletId: '',
    };

    const existingAccount = accounts.find(account => account.id.toLowerCase() === accountAddress.toLowerCase());
    const updatedAccounts = accounts.filter(account => account.id.toLowerCase() !== accountAddress.toLowerCase());
    const backendAccount = backendAccounts.find(({ ethAddress }) =>
      ethAddress.toLowerCase() === accountAddress.toLowerCase());

    if (backendAccount) {
      smartWalletAccount.walletId = backendAccount.id;
    }

    if (existingAccount && backendAccount && !existingAccount.walletId) {
      existingAccount.walletId = backendAccount.id;
    }

    if (existingAccount) {
      updatedAccounts.push({ ...existingAccount, extra: accountExtra });
    } else {
      updatedAccounts.push(smartWalletAccount);
    }

    dispatch({
      type: UPDATE_ACCOUNTS,
      payload: updatedAccounts,
    });
    await dispatch(saveDbAction('accounts', { accounts: updatedAccounts }, true));
  };
};

export const setActiveAccountAction = (accountId: string) => {
  return async (dispatch: Function, getState: Function) => {
    const {
      accounts: { data: accounts },
      smartWallet: {
        connectedAccount = {},
        upgrade: {
          status: upgradeStatus,
        },
      },
    } = getState();
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
      // TODO: account not found in storage
      console.log('setActiveAccountAction account not found by id: ', accountId);
      return;
    }
    const updatedAccounts = accounts.map(acc => ({ ...acc, isActive: acc.id === accountId }));
    dispatch({
      type: UPDATE_ACCOUNTS,
      payload: updatedAccounts,
    });
    await dispatch(saveDbAction('accounts', { accounts: updatedAccounts }, true));

    if (account.type !== ACCOUNT_TYPES.SMART_WALLET || !account.extra) return;

    const { state = '' } = connectedAccount;
    if (state === sdkConstants.AccountStates.Deployed) {
      dispatch(setSmartWalletUpgradeStatusAction(SMART_WALLET_UPGRADE_STATUSES.DEPLOYMENT_COMPLETE));
      return;
    }
    if ([
      SMART_WALLET_UPGRADE_STATUSES.TRANSFERRING_ASSETS,
      SMART_WALLET_UPGRADE_STATUSES.DEPLOYING,
    ].includes(upgradeStatus)) {
      return;
    }
    dispatch(setSmartWalletUpgradeStatusAction(SMART_WALLET_UPGRADE_STATUSES.ACCOUNT_CREATED));
  };
};

export const switchAccountAction = (accountId: string, privateKey?: string) => {
  return async (dispatch: Function, getState: Function) => {
    const {
      accounts: { data: accounts },
      assets: { data: assets },
    } = getState();
    const account = accounts.find(_acc => _acc.id === accountId) || {};

    if (account.type === ACCOUNT_TYPES.KEY_BASED) {
      await dispatch(setActiveAccountAction(accountId));
    } else if (account.type === ACCOUNT_TYPES.SMART_WALLET && privateKey) {
      await dispatch(initSmartWalletSdkAction(privateKey));
      await dispatch(connectSmartWalletAccountAction(accountId));
      await dispatch(setActiveAccountAction(accountId));
    }

    dispatch(fetchAssetsBalancesAction(assets));
    dispatch(fetchCollectiblesAction());
  };
};

export const initSmartWalletAccountAction = (privateKey: string) => {
  return async (dispatch: Function, getState: Function) => {
    const { accounts: { data: accounts } } = getState();
    const activeAccountId = getActiveAccountId(accounts);
    const activeAccountType = getActiveAccountType(accounts);

    if (activeAccountType !== ACCOUNT_TYPES.SMART_WALLET) return;

    await dispatch(initSmartWalletSdkAction(privateKey));
    await dispatch(connectSmartWalletAccountAction(activeAccountId));
    await dispatch(fetchVirtualAccountBalanceAction());
  };
};