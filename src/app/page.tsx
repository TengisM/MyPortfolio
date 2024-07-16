import Header from "@/components/header";
import Footer from "@/components/footer";
import { Hero, Projects } from "@/components/sections";
import { ScrollPop } from "@/components/common";

export default function Home() {
	return (
		<main className="flex flex-col items-center mx-auto">
			<Header />
			<Hero />
			<Projects />
			<ScrollPop />
			<Footer />
		</main>
	);
};
