import { GooglePayPayPal, GooglePayConfig } from '~/composables/useGooglePay/types';
import { cartGetters, orderGetters } from '@plentymarkets/shop-api';

const baseRequest = {
  apiVersion: 2,
  apiVersionMinor: 0,
};

const loadExternalScript = async () => {
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = 'https://pay.google.com/gp/p/js/pay.js';
    scriptElement.type = 'text/javascript';
    scriptElement.addEventListener('error', reject);
    scriptElement.addEventListener('load', resolve);
    document.head.append(scriptElement);
  });
};

const getPaymentsClient = () => {
  return new google.payments.api.PaymentsClient({
    environment: 'TEST',
  });
};

const showErrorNotification = (message: string) => {
  useNotification().send({
    type: 'negative',
    message,
  });
};

export const useGooglePay = () => {
  const state = useState(`useGooglePay`, () => ({
    scriptLoaded: false,
    script: null as GooglePayPayPal | null,
    googleConfig: {} as GooglePayConfig,
    paymentsClient: {} as google.payments.api.PaymentsClient,
  }));

  const initialize = async () => {
    const { data: cart, clearCartItems } = useCart();
    const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
    const { getScript } = usePayPal();
    const script = await getScript(currency.value);

    console.log('Initializing Google Pay')

    if (!script) return false;
    console.log('Script loaded')

    if (!state.value.scriptLoaded) {
      await loadExternalScript();
      state.value.scriptLoaded = true;
    }

    state.value.script = (script as any).Googlepay() as GooglePayPayPal;
    console.log('Google script loaded')
    state.value.googleConfig = await state.value.script.config();
    state.value.paymentsClient = getPaymentsClient();

    return true;
  };

  const getGoogleTransactionInfo = () => {
    const { data: cart } = useCart();
    const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
    return {
      countryCode: state.value.googleConfig.countryCode,
      currencyCode: currency.value,
      totalPriceStatus: 'FINAL',
      totalPrice: cartGetters.getTotals(cart.value).total.toString(),
    } as google.payments.api.TransactionInfo;
  };

  const getGooglePaymentDataRequest = async () => {
    const paymentDataRequest = Object.assign({}, baseRequest) as google.payments.api.PaymentDataRequest;
    const { allowedPaymentMethods, merchantInfo } = state.value.googleConfig;
    paymentDataRequest.allowedPaymentMethods = allowedPaymentMethods;
    paymentDataRequest.transactionInfo = getGoogleTransactionInfo();
    paymentDataRequest.merchantInfo = merchantInfo;
    return paymentDataRequest;
  };

  const processPayment = async (paymentData: google.payments.api.PaymentData) => {
    if (!state.value.script) return;
    const localePath = useLocalePath();
    const { createCreditCardTransaction, getOrder, captureOrder, executeOrder } = usePayPal();
    const { data: cart, clearCartItems } = useCart();
    const { shippingPrivacyAgreement } = useAdditionalInformation();
    const { createOrder } = useMakeOrder();

    const transaction = await createCreditCardTransaction();
    if (!transaction || !transaction.id) {
      showErrorNotification('Failed to create transaction');
      return;
    }

    let { status } = await state.value.script.confirmOrder({
      orderId: transaction.id,
      paymentMethodData: paymentData.paymentMethodData,
    });

    if (status === 'PAYER_ACTION_REQUIRED') {
      await state.value.script.initiatePayerAction();
      const paypalOrder = (await getOrder({
        paypalOrderId: transaction.id,
        payPalPayerId: transaction.payPalPayerId,
      })) as any;
      status = paypalOrder?.result?.status || 'ERROR';
    }

    if (status === 'APPROVED') {
      await captureOrder({
        paypalOrderId: transaction.id,
        paypalPayerId: transaction.payPalPayerId,
      });
      const order = await createOrder({
        paymentId: cart.value.methodOfPaymentId,
        shippingPrivacyHintAccepted: shippingPrivacyAgreement.value,
      });

      if (!order || !order.order || !order.order.id) {
        showErrorNotification('Failed to create plenty order');
        return;
      }

      const executedOrder = await executeOrder({
        mode: 'paypal',
        plentyOrderId: Number.parseInt(orderGetters.getId(order)),
        paypalTransactionId: transaction.id,
      });

      if (!executedOrder) {
        showErrorNotification('Failed to execute order');
        return;
      }

      clearCartItems();
      navigateTo(localePath(paths.confirmation + '/' + order.order.id + '/' + order.order.accessKey));

      return { transactionState: 'SUCCESS' };
    } else {
      showErrorNotification('Payment failed');
      return { transactionState: 'ERROR' };
    }
  };

  const getIsReadyToPayRequest = (): google.payments.api.IsReadyToPayRequest => {
    console.log('Getting is ready to pay request')
    const paymentDataRequest = Object.assign({}) as google.payments.api.IsReadyToPayRequest;
    console.log('Payment data request', paymentDataRequest)
    paymentDataRequest.apiVersion = 2;
    console.log('Payment data request', paymentDataRequest)
    paymentDataRequest.apiVersionMinor = 0;
    console.log('Payment data request', paymentDataRequest)
    paymentDataRequest.allowedPaymentMethods = state.value.googleConfig.allowedPaymentMethods;
    console.log('Payment data request return', paymentDataRequest)
    return paymentDataRequest;
  }

  return {
    ...toRefs(state.value),
    initialize,
    getGooglePaymentDataRequest,
    processPayment,
    getIsReadyToPayRequest,
  };
};
