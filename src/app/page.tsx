import Image from "next/image";
import Header from "@/components/header";
import { Hero } from "@/components/sections";

export default function Home() {
	return (
		<main className="flex flex-col items-center mx-auto px-6 max-w-screen-xl min-h-screen">
			<Header />
			<Hero />
		</main>
	);
}
