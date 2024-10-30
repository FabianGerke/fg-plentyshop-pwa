import { cartGetters, orderGetters } from '@plentymarkets/shop-api';
import { ApplepayType, ConfigResponse } from '~/components/PayPal/types';

const loadExternalScript = async () => {
  return new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');
    scriptElement.src = 'https://applepay.cdn-apple.com/jsapi/v1/apple-pay-sdk.js';
    scriptElement.type = 'text/javascript';
    scriptElement.addEventListener('error', reject);
    scriptElement.addEventListener('load', resolve);
    document.head.append(scriptElement);
  });
};

const showErrorNotification = (message: string) => {
  useNotification().send({
    type: 'negative',
    message,
  });
};

export const useApplePay = () => {
  const state = useState(`useApplePay`, () => ({
    scriptLoaded: false,
    script: {} as ApplepayType,
    paymentSession: null as ApplePaySession | null,
    config: {} as ConfigResponse,
  }));

  const initialize = async () => {
    const { data: cart } = useCart();
    const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));
    const { getScript } = usePayPal();
    const script = await getScript(currency.value);

    if (!script) return false;

    if (!state.value.scriptLoaded) {
      await loadExternalScript();
      state.value.scriptLoaded = true;
    }

    state.value.script = (script as any).Applepay() as ApplepayType;
    state.value.config = await state.value.script.config();

    return true;
  };

  const createPaymentRequest = () => {
    const { data: cart } = useCart();
    return {
      countryCode: state.value.config.countryCode,
      merchantCapabilities: state.value.config.merchantCapabilities,
      supportedNetworks: state.value.config.supportedNetworks,
      currencyCode: state.value.config.currencyCode,
      requiredShippingContactFields: [],
      requiredBillingContactFields: ['postalAddress'],
      total: {
        type: 'final',
        label: useRuntimeConfig().public.storename ?? 'plentyshop PWA',
        amount: cartGetters.getTotals(cart.value).total.toString(),
      },
    } as ApplePayJS.ApplePayPaymentRequest;
  };

  const processPayment = () => {
    const { createOrder } = useMakeOrder();
    const { createCreditCardTransaction, captureOrder, executeOrder } = usePayPal();
    const { data: cart, clearCartItems } = useCart();
    const localePath = useLocalePath();
    const { shippingPrivacyAgreement } = useAdditionalInformation();

    try {
      const paymentRequest = createPaymentRequest();
      const paymentSession = new ApplePaySession(14, paymentRequest);

      paymentSession.onvalidatemerchant = async (event: ApplePayJS.ApplePayValidateMerchantEvent) => {
        try {
          const validationData = await state.value.script.validateMerchant({
            validationUrl: event.validationURL,
          });
          paymentSession.completeMerchantValidation(validationData.merchantSession);
        } catch (error) {
          console.error(error);
          paymentSession.abort();
        }
      };

      paymentSession.onpaymentauthorized = async (event: ApplePayJS.ApplePayPaymentAuthorizedEvent) => {
        try {
          const transaction = await createCreditCardTransaction();
          if (!transaction || !transaction.id) {
            showErrorNotification('Transaction creation failed');
            return;
          }

          const order = await createOrder({
            paymentId: cart.value.methodOfPaymentId,
            shippingPrivacyHintAccepted: shippingPrivacyAgreement.value,
          });
          if (!order || !order.order || !order.order.id) {
            showErrorNotification('Order creation failed');
            return;
          }

          try {
            await state.value.script.confirmOrder({
              orderId: transaction.id,
              token: event.payment.token,
              billingContact: event.payment.billingContact,
            });
          } catch (error) {
            showErrorNotification(error?.toString() ?? 'Error during order confirmation');
            return;
          }

          await executeOrder({
            mode: 'paypal',
            plentyOrderId: Number.parseInt(orderGetters.getId(order)),
            paypalTransactionId: transaction.id,
          });

          paymentSession.completePayment(ApplePaySession.STATUS_SUCCESS);

          clearCartItems();

          navigateTo(localePath(paths.confirmation + '/' + order.order.id + '/' + order.order.accessKey));
        } catch (error: unknown) {
          showErrorNotification(error?.toString() ?? 'Error during payment process');
          paymentSession.completePayment(ApplePaySession.STATUS_FAILURE);
        }
      };

      paymentSession.addEventListener('cancel', () => {
        console.error('Apple pay cancel');
      });

      paymentSession.begin();
    } catch (error) {
      console.error(error);
    }
  };

  const checkIsEligible = async () => {
    if (
      (await initialize()) &&
      typeof ApplePaySession !== 'undefined' &&
      state.value.script &&
      ApplePaySession &&
      ApplePaySession.canMakePayments() &&
      state.value.config.isEligible
    ) {
      await useSdk().plentysystems.doHandleAllowPaymentApplePay({
        canMakePayments: true,
      });
      return true;
    }
    return false;
  };

  return {
    initialize,
    checkIsEligible,
    processPayment,
    ...toRefs(state.value),
  };
};