// ═══════════════════════════════════════════════════════════════
// إعداد Firebase للإنتاج — مشروع ba9it-424c8 (المنطقة: europe-west1)
// ═══════════════════════════════════════════════════════════════
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCZqWr_619eEs7oneRgeeYs5zWulfWSc2o",
  authDomain: "ba9it-424c8.firebaseapp.com",
  projectId: "ba9it-424c8",
  storageBucket: "ba9it-424c8.firebasestorage.app",
  messagingSenderId: "884288584494",
  appId: "1:884288584494:web:c8dbbc0c9c3c844c9cd8bf",
};

const app = initializeApp(firebaseConfig);
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6LcZVT8tAAAAAFmQ3pIiiGm0RcB5ZVCXaMu87jfv"),
  isTokenAutoRefreshEnabled: true,
});
export const auth = getAuth(app);
export const db = getFirestore(app);
// المنطقة تطابق منطقة نشر الدوال (europe-west1)
export const functions = getFunctions(app, "europe-west1");

export default app;
