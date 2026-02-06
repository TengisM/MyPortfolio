import { animate } from "motion";

export const scrollToSection = (id: string) => {
	if (typeof window === "undefined") return;

	const target = document.getElementById(id);
	if (!target) return;

	const headerOffset = 60;
	const targetY =
		target.getBoundingClientRect().top +
		window.scrollY -
		headerOffset;

	animate(window.scrollY, targetY, {
		type: "spring",
		stiffness: 120,
		damping: 20,
		onUpdate: (latest) => window.scrollTo(0, latest),
	});
};