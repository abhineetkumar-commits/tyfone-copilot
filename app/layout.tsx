import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';
import AuthProvider from '@/components/AuthProvider';
export const metadata: Metadata = { title: 'Tyfone Copilot', description: 'AI-powered credit union go-live platform' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body><AuthProvider><NavBar /><main>{children}</main></AuthProvider></body></html>
  );
}
