// @flow
import * as React from 'react';
import { connect } from 'react-redux';
import styled from 'styled-components/native';
import type { NavigationScreenProp } from 'react-navigation';
import { SIGN_IN, SIGN_UP } from 'constants/navigationConstants';
import HyperLink from 'components/HyperLink';
import { Container, Footer } from 'components/Layout';
import Button from 'components/Button';
import HelpTextDivider from 'components/HelpTextDivider';
import AnimatedBackground from 'components/AnimatedBackground';

type Props = {
  navigation: NavigationScreenProp<*>,
  isFetched: boolean,
  OTP: boolean | number,
}

const pillarLogoSource = require('assets/images/landing-pillar-logo.png');

const PillarLogo = styled.Image`
  height: 60;
  width: 120;
`;

class Welcome extends React.Component<Props> {
  loginAction = () => {
    this.props.navigation.navigate(SIGN_IN);
  };

  signupAction = () => {
    this.props.navigation.navigate(SIGN_UP);
  };

  render() {
    const { isFetched, OTP } = this.props;
    if (!isFetched || OTP) return null;
    return (
      <Container center>
        <AnimatedBackground />
        <PillarLogo source={pillarLogoSource} />
        <Footer>
          <Button block marginBottom="20px" onPress={this.loginAction} title="Login" />
          <HelpTextDivider title="Don&#39;t have an account?" />
          <Button marginBottom="20px" onPress={this.signupAction} secondary title="Signup" />
          <HyperLink url="https://pillarproject.io/en/terms-of-use/">Terms and Conditions</HyperLink>
        </Footer>
      </Container>
    );
  }
}

const mapStateToProps = ({ appSettings: { isFetched, data: { OTP } } }) => ({
  isFetched,
  OTP,
});

export default connect(mapStateToProps)(Welcome);
