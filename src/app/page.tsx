import Header from "@/components/header";
import Footer from "@/components/footer";
import { Hero, Projects, Contact } from "@/components/sections";
import { ScrollPop } from "@/components/common";

export default function Home() {
	return (
		<main className="overflow-hidden flex flex-col items-center mx-auto">
			<Header />
			<Hero />
			<Projects />
			{/* <Contact /> */}
			<ScrollPop />
			<Footer />
		</main>
	);
};
