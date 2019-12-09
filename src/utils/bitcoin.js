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
import { MIN_CONFIRMATIONS } from 'constants/bitcoinConstants';
import type { BitcoinUtxo, BTCTransaction } from 'models/Bitcoin';


export const satoshisToBtc = (satoshis: number): number => satoshis * 0.00000001;
export const btcToSatoshis = (btc: number): number => Math.floor(btc * 100000000);

export const unspentAmount = (unspent: BitcoinUtxo[]): number => {
  return unspent.reduce((acc: number, transaction: BitcoinUtxo): number => {
    // Make sure we don't use unconfirmed transactions for the balance,
    // since those transactions can still be rejected later by the network.
    if (transaction.confirmations < MIN_CONFIRMATIONS) {
      return acc;
    }
    return acc + transaction.satoshis;
  }, 0);
};

export const extractBitcoinTransactions = (address: string, transactions: BTCTransaction[]): Object[] => {
  const transactionsHistory = [];
  transactions.forEach((tx: BTCTransaction) => {
    tx.details.coins.inputs.forEach(inputItem => {
      const txItem = {
        _id: inputItem._id,
        hash: tx.details.txid,
        to: address,
        from: inputItem.address,
        createdAt: new Date(tx.details.blockTime).getTime() / 1000,
        asset: 'BTC',
        nbConfirmations: tx.details.confirmations,
        status: inputItem.mintHeight !== -1 ? 'confirmed' : 'pending',
        value: inputItem.value,
        isPPNTransaction: false,
        type: 'transactionEvent',
      };
      transactionsHistory.push(txItem);
    });
    tx.details.coins.outputs.forEach(inputItem => {
      const txItem = {
        _id: inputItem._id,
        hash: tx.details.txid,
        to: inputItem.address,
        from: address,
        createdAt: new Date(tx.details.blockTime).getTime() / 1000,
        asset: 'BTC',
        nbConfirmations: tx.details.confirmations,
        status: inputItem.mintHeight !== -1 ? 'confirmed' : 'pending',
        value: inputItem.value,
        isPPNTransaction: false,
        type: 'transactionEvent',
      };
      transactionsHistory.push(txItem);
    });
  });
  return transactionsHistory;
};