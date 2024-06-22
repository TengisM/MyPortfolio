export default function Header() {
	return (
        <header className="z-10 absolute max-w-screen-xl w-full mx-auto p-6 font-mono flex items-center gap-5">
            <a
                href="/"
                className="rounded-xl content-center mr-5 px-2.5 py-1.5 bg-neutral-700/50 backdrop-blur-sm border border-cyan-700"
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
        </header>
	);
}
