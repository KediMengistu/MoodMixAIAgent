// app/page.tsx
import { LoginForm } from "@/app/_components/Login-form";

export default function Home() {
  return (
    <div className="relative min-h-[391px] h-full w-full p-2 overflow-y-auto flex items-center justify-center">
      <div className="relative z-10">
        <LoginForm />
      </div>
    </div>
  );
}
