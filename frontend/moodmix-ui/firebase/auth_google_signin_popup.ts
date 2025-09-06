import { auth } from "@/firebase/firebaseConfig";
import {
  GoogleAuthProvider,
  signInWithPopup,
  type User as FirebaseUser,
} from "firebase/auth";

export async function signInWithGoogle(): Promise<{
  user: FirebaseUser;
  token: string | null;
}> {
  const provider = new GoogleAuthProvider();
  // Optional: force account chooser
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const token = credential?.accessToken ?? null;
  return { user: result.user, token };
}
