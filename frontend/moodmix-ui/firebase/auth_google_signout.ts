import { auth } from "@/firebase/firebaseConfig";
import { signOut } from "firebase/auth";

export async function signOutWithGoogle(): Promise<void> {
  await signOut(auth);
}
