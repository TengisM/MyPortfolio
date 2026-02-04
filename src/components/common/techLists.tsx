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
	<span className="bg-cyan-400 shadow-lg shadow-purple-600/60 text-black px-3 py-1 rounded-full text-xs lg:text-sm font-semibold cursor-default">
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
