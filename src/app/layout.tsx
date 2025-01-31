import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { CursorEffect } from "@/components/common";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		template: "%s | Tenggis",
		default: "Tenggis Portfolio",
	},
	description: "Welcome to my portfolio",
	keywords: ['Tenggis', 'Tengis', 'Portfolio'],
};

export default function RootLayout({
  	children,
}: Readonly<{
  	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={inter.className + 'overflow-hidden flex flex-col items-center mx-auto'}>
				<CursorEffect />
				<Header />
				<main className="z-10">
					{children}
				</main>
				<Footer />
			</body>
		</html>
	);
};
