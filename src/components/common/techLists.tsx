interface ISocialItem {
    label: string;
};

const techItems: ISocialItem[] = [
	"React",
	"NextJS",
	"Javascript/Typescript",
	"Zustand/Redux",
	"Node.js",
	"PostgreSQL",
	"Web3 (Thirdweb, wagmi)",
	"Git",
	"Vue",
	"TailwindCSS",
].map(label => ({ label }));

const TechItem = ({ label }: ISocialItem) => (
	<span className="relative px-3 py-1 rounded-full text-xs lg:text-sm font-semibold cursor-default bg-neutral-900/40
			backdrop-blur-md border border-cyan-400/40 text-cyan-300 transition-all duration-300 ease-out
			hover:-translate-y-1 hover:scale-105 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(211,34,238,0.35)]">
	  	{label}
	</span>
);

const TechLists = () => {
	return (
		<div className='flex flex-col py-4'>
			<h3 className="text-xl font-semibold mb-2 cursor-default">Skills</h3>
			<div className="flex flex-wrap justify-center lg:justify-start gap-2">
				{techItems.map(({ label }) => (
					<TechItem key={label} label={label} />
				))}
			</div>
		</div>
	);
};

export default TechLists;
