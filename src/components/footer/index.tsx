export default function Footer() {
	return (
        <footer className="z-10 w-full font-mono flex items-center gap-4">
            <a
                href="/"
                className="rounded-xl content-center mr-5 px-2.5 py-1.5 border border-neutral-700 bg-neutral-800/30"
            >
                <h3 className="text-lg font-semibold">
                    TM
                </h3>
            </a>
            <a
                href="/"
                className="relative"
            >
                <h3 className="text-xl font-semibold before:bg-cyan-400/60 before:block before:absolute before:inset-0 before:transition-transform before:duration-300 before:ease-in before:scale-x-0 before:origin-bottom-right before:hover:scale-x-100 before:hover:origin-bottom-left">
                    projects
                </h3>
            </a>

            <a
                href="/"
                className="relative"
            >
                <h3 className="text-xl font-semibold before:bg-cyan-400/60 before:block before:absolute before:inset-0 before:transition-transform before:duration-300 before:ease-in before:scale-x-0 before:origin-bottom-right before:hover:scale-x-100 before:hover:origin-bottom-left">
                    contact
                </h3>
            </a>
        </footer>
	);
}
