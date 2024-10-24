import { PaymentEligibility, UseMobileMethodsReturn, UseMobilePaymentMethods } from './types';
import {cartGetters} from "@plentymarkets/shop-api";
import {PayPalNamespace} from "@paypal/paypal-js";
import {usePaymentMethods} from "~/composables";

const checkMobilePayments = async (): Promise<PaymentEligibility> => {
  const { getScript } = usePayPal();
  const { data: cart } = useCart();
  const currency = computed(() => cartGetters.getCurrency(cart.value) || (useAppConfig().fallbackCurrency as string));

  const paypal = await getScript(currency.value);
  const googlePayLoaded = await loadGooglePayScript();

  const applePayEligible = checkApplePayEligibility();
  const googlePayEligible = googlePayLoaded && paypal ? await checkGooglePayEligibility(paypal) : false;

  return {
    applePayEligible,
    googlePayEligible,
  };
};

// Dynamically load Google Pay SDK
function loadGooglePayScript(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const existingScript = document.querySelector('#google-pay-script');

      if (existingScript) {
        // If script is already loaded, resolve immediately
        resolve(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://pay.google.com/gp/p/js/pay.js';
      script.async = true;
      script.id = 'google-pay-script';

      // Event listener for successful script load
      script.addEventListener('load', () => {
        resolve(true);
      });

      // Event listener for script loading errors
      script.addEventListener('error', () => {
        console.error('Failed to load Google Pay script.');
      });

      // Append the script to the document head
      document.head.append(script);
    } catch {
      // In case of any other unexpected error
    }
  });
}

// Check if Google Pay is available
async function checkGooglePayEligibility(paypalScript: PayPalNamespace): Promise<boolean> {
  if (typeof window === 'undefined' || typeof google === 'undefined' || !google.payments) return false;

  try {
    const googlePayClient = new google.payments.api.PaymentsClient({
      environment: 'TEST', // or 'TEST' depending on your environment
    });
    const googlePay = (paypalScript as any).Googlepay();
    const config = await googlePay.config();
    const request = Object.assign({}, {
      apiVersion: 2,
      apiVersionMinor: 0,
    }, {
      allowedPaymentMethods: config.allowedPaymentMethods,
    });

    await googlePayClient
      .isReadyToPay(request)
      .then(async function (response) {
        if (response.result) {
          await useSdk().plentysystems.doHandleAllowPaymentGooglePay(config.allowedPaymentMethods)
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  } catch (e) {
    console.error(e);
  }

  return false;
}

// Check if Apple Pay is available
function checkApplePayEligibility(): boolean {
  return typeof ApplePaySession !== 'undefined' && ApplePaySession.canMakePayments();
}

export const useMobileMethods: UseMobileMethodsReturn = (): UseMobilePaymentMethods => {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const setMobilePayments: any = async () => {
    await checkMobilePayments();
    await usePaymentMethods().fetchPaymentMethods();
  };

  return {
    setMobilePayments,
  };
};
