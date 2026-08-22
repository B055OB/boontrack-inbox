import { redirect } from 'next/navigation';

export default function RootPage() {
  // Langsung arahkan pengunjung ke Super Admin
  redirect('/admin');
}