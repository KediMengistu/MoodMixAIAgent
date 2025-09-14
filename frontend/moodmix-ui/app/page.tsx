// app/page.tsx
import { LoginForm } from "@/app/_components/Login-form";

export default function Login() {
  return (
    <div className="relative h-full w-full p-2 overflow-y-auto scrollbar-hide flex items-center justify-center">
      <div className="relative z-10">
        <LoginForm />
      </div>
    </div>
  );
}
