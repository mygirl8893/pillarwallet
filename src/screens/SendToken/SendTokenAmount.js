// @flow
import * as React from 'react';
import { connect } from 'react-redux';
import { TouchableOpacity, Keyboard } from 'react-native';
import t from 'tcomb-form-native';
import { utils, providers } from 'ethers';
import { NETWORK_PROVIDER } from 'react-native-dotenv';
import { BigNumber } from 'bignumber.js';
import styled from 'styled-components/native';
import type { NavigationScreenProp } from 'react-navigation';
import { Container, Footer, Wrapper } from 'components/Layout';
import SingleInput from 'components/TextInput/SingleInput';
import Button from 'components/Button';
import { SEND_TOKEN_CONFIRM } from 'constants/navigationConstants';
import { ETH } from 'constants/assetsConstants';
import { TextLink, Label, BaseText } from 'components/Typography';
import Header from 'components/Header';
import type { TransactionPayload } from 'models/Transaction';
import type { Balances } from 'models/Asset';
import { parseNumber, formatAmount, isValidNumber } from 'utils/common';
import { fontSizes, spacing, UIColors } from 'utils/variables';
import { getBalance } from 'utils/assets';

const provider = providers.getDefaultProvider(NETWORK_PROVIDER);

const { Form } = t.form;
const gasLimit = 500000;

const getFormStructure = (maxAmount: number, minAmount: number, enoughForFee: boolean, formSubmitted: boolean) => {
  const Amount = t.refinement(t.String, (amount): boolean => {
    if (amount.toString() === '' && !formSubmitted) return true;
    if (!isValidNumber(amount.toString())) return false;

    amount = parseNumber(amount.toString());
    const isValid = enoughForFee && amount <= maxAmount && amount >= minAmount;

    if (formSubmitted) return isValid && amount > 0;
    return isValid;
  });

  Amount.getValidationErrorMessage = (amount): string => {
    if (!isValidNumber(amount.toString())) {
      return 'Incorrect number entered.';
    }

    amount = parseNumber(amount.toString());
    if (!enoughForFee) {
      return 'Not enough ETH to process the transaction fee';
    } else if (amount >= maxAmount) {
      return 'Amount should not exceed the sum of total balance and est. network fee';
    } else if (amount < minAmount) {
      return 'Amount should be greater than 1 Wei (0.000000000000000001 ETH)';
    }
    return 'Amount should be specified.';
  };

  return t.struct({
    amount: Amount,
  });
};

function AmountInputTemplate(locals) {
  const { config: { icon } } = locals;
  const errorMessage = locals.error;
  const inputProps = {
    autoFocus: true,
    onChange: locals.onChange,
    onBlur: locals.onBlur,
    placeholder: '0',
    value: locals.value,
    ellipsizeMode: 'middle',
    keyboardType: 'decimal-pad',
    textAlign: 'right',
    autoCapitalize: 'words',
  };

  return (
    <SingleInput
      innerImageURI={icon}
      errorMessage={errorMessage}
      id="amount"
      inputProps={inputProps}
      inlineLabel
      fontSize={fontSizes.giant}
    />
  );
}

const generateFormOptions = (config: Object): Object => ({
  fields: {
    amount: {
      template: AmountInputTemplate,
      config,
      transformer: {
        parse: (str = '') => str.toString().replace(/,/g, '.'),
        format: (value = '') => value.toString().replace(/,/g, '.'),
      },
    },
  },
});

const ActionsWrapper = styled.View`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;

const SendTokenDetails = styled.View``;

const SendTokenDetailsValue = styled(BaseText)`
  font-size: ${fontSizes.small};
  margin-bottom: ${spacing.rhythm / 2}px;
`;

type Props = {
  token: string;
  address: string,
  totalBalance: number,
  contractAddress: string,
  navigation: NavigationScreenProp<*>,
  isVisible: boolean,
  formValues?: Object,
  balances: Balances,
  session: Object,
}

type State = {
  value: ?{
    amount: ?string,
  },
  formStructure: t.struct,
  txFeeInWei: ?Object, // BigNumber
}

class SendTokenAmount extends React.Component<Props, State> {
  _form: t.form;
  assetData: Object;
  gasPrice: Object; // BigNumber
  gasPriceFetched: boolean = false;
  maxAmount: number;
  minAmount: number;
  formSubmitted: boolean = false;
  enoughForFee: boolean = false;
  receiver: string;

  constructor(props: Props) {
    super(props);
    this.assetData = this.props.navigation.getParam('assetData', {});
    this.receiver = this.props.navigation.getParam('receiver', '');
    const balance = getBalance(props.balances, this.assetData.token);
    this.maxAmount = +balance;
    this.minAmount = 0.000000000000000001; // 1 Wei
    this.state = {
      value: null,
      formStructure: getFormStructure(this.maxAmount, this.minAmount, this.enoughForFee, this.formSubmitted),
      txFeeInWei: null,
    };
  }

  componentDidMount() {
    this.fetchGasPrice();
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.session.isOnline !== this.props.session.isOnline && this.props.session.isOnline) {
      this.fetchGasPrice();
    }
  }

  fetchGasPrice() {
    provider.getGasPrice()
      .then(gasPrice => {
        const increasedGasPrice = gasPrice.mul(2);
        this.gasPrice = increasedGasPrice;
        this.gasPriceFetched = true;
        const { token } = this.assetData;
        const { balances } = this.props;
        const { balance } = balances[token];
        const txFeeInWei = this.gasPrice.mul(gasLimit);
        this.maxAmount = this.calculateMaxAmount(token, balance, txFeeInWei);
        this.enoughForFee = this.checkIfEnoughForFee(balances, txFeeInWei);

        this.setState({
          txFeeInWei,
          formStructure: getFormStructure(this.maxAmount, this.minAmount, this.enoughForFee, this.formSubmitted),
        });
      })
      .catch(() => { });
  }

  handleChange = (value: Object) => {
    this.setState({ value });
  };

  handleFormSubmit = () => {
    this.formSubmitted = true;
    const { txFeeInWei } = this.state;
    const { token } = this.assetData;
    const { balances } = this.props;
    const { balance } = balances[token];
    this.maxAmount = this.calculateMaxAmount(token, balance, txFeeInWei);
    this.setState({
      formStructure: getFormStructure(this.maxAmount, this.minAmount, this.enoughForFee, this.formSubmitted),
    }, () => {
      const value = this._form.getValue();
      const { navigation } = this.props;

      if (!value || !this.gasPriceFetched) return;

      const transactionPayload: TransactionPayload = {
        to: this.receiver,
        amount: value.amount,
        gasLimit,
        gasPrice: this.gasPrice.toNumber(),
        txFeeInWei: txFeeInWei ? txFeeInWei.toNumber() : 0,
        symbol: this.assetData.token,
        contractAddress: this.assetData.contractAddress,
        decimals: this.assetData.decimals,
      };

      Keyboard.dismiss();
      navigation.navigate(SEND_TOKEN_CONFIRM, {
        transactionPayload,
      });
    });
  };

  useMaxValue = () => {
    if (!this.gasPriceFetched) return;
    const { txFeeInWei } = this.state;
    const { balances } = this.props;
    const { token } = this.assetData;
    const { balance } = balances[token];
    const maxAmount = this.calculateMaxAmount(token, balance, txFeeInWei);

    this.setState({
      value: {
        amount: formatAmount(maxAmount),
      },
    }, () => { this._form.getValue(); }); // trigger form validation
  };

  calculateMaxAmount(token: string, balance: string, txFeeInWei: ?Object): number {
    if (typeof balance !== 'string') {
      balance = balance.toString();
    }
    if (token !== ETH) {
      return +balance;
    }
    const maxAmount = utils.parseUnits(balance, 'ether').sub(txFeeInWei);
    if (maxAmount.lt(0)) return 0;
    return new BigNumber(utils.formatEther(maxAmount)).toNumber();
  }

  checkIfEnoughForFee(balances: Balances, txFeeInWei): boolean {
    if (!balances[ETH]) return false;
    const ethBalance = getBalance(balances, ETH);
    const balanceInWei = utils.parseUnits(ethBalance.toString(), 'ether');
    return balanceInWei.gte(txFeeInWei);
  }

  render() {
    const {
      value,
      formStructure,
      txFeeInWei,
    } = this.state;
    const { session, balances } = this.props;
    const { token, icon } = this.assetData;
    const { balance } = balances[token];
    const formattedBalance = formatAmount(balance);
    const formOptions = generateFormOptions({ icon, currency: token });
    const txFeeInEth = !!txFeeInWei && utils.formatEther(txFeeInWei);
    return (
      <Container color={UIColors.defaultBackgroundColor}>
        <Header
          onBack={() => this.props.navigation.goBack(null)}
          onClose={this.props.navigation.dismiss}
          title={`send ${this.assetData.token}`}
        />
        <Wrapper regularPadding>
          <Form
            ref={node => { this._form = node; }}
            type={formStructure}
            options={formOptions}
            value={value}
            onChange={this.handleChange}
          />
          <ActionsWrapper>
            <SendTokenDetails>
              <Label small>Available Balance</Label>
              <SendTokenDetailsValue>{formattedBalance} {token}</SendTokenDetailsValue>
              <Label small>Est. Network Fee</Label>
              <SendTokenDetailsValue>{txFeeInEth || 0} ETH</SendTokenDetailsValue>
            </SendTokenDetails>
            <TouchableOpacity onPress={this.useMaxValue}>
              <TextLink>Send All</TextLink>
            </TouchableOpacity>
          </ActionsWrapper>
        </Wrapper>
        <Footer keyboardVerticalOffset={35}>
          <Button disabled={!session.isOnline} small flexRight title="Next" onPress={this.handleFormSubmit} />
        </Footer>
      </Container>
    );
  }
}

const mapStateToProps = ({ assets: { balances }, session: { data: session } }) => ({
  balances,
  session,
});

export default connect(mapStateToProps)(SendTokenAmount);
