import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { CursorEffect, DotBg } from "@/components/common";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: {
		template: "%s | Tenggis Portfolio",
		default: "Tenggis - Frontend Developer Portfolio",
	},
	description: "Discover Tenggis' portfolio, a frontend developer specializing in Next.js, and modern web development.",
	keywords: [
		'Tenggis', 'Frontend Developer', 'React Developer', 'Next.js Developer', 'TypeScript', 'Web Developer Portfolio', 'Next.js Portfolio'
	],
	authors: [{ name: "Tenggis", url: "https://tenggis.vercel.app/" }],
	openGraph: {
		title: "Tenggis - Frontend Developer Portfolio",
		description: "Explore projects and expertise in Next.js, and modern frontend development.",
		url: "https://tenggis.vercel.app/",
		siteName: "Tenggis Portfolio",
		// images: [
		// 	{
		// 		url: "https://your-portfolio-url.com/og-image.jpg",
		// 		width: 1200,
		// 		height: 630,
		// 		alt: "Tenggis Portfolio - React and Next.js Developer",
		// 	},
		// ],
		type: "website",
	},
	robots: {
		index: true,
		follow: true,
	},
	alternates: {
		canonical: "https://tenggis.vercel.app/",
	},
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
				<DotBg />
				<Header />
				<main className="z-10">
					{children}
				</main>
				<Footer />
			</body>
		</html>
	);
};
