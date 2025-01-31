interface ISocialItem {
    label: string;
};

const techItems: ISocialItem[] = [
	{ label: 'React' },
    { label: 'Next.JS' },
	{ label: 'Javascript' },
	{ label: 'Typescript' },
	{ label: 'Jest' },
	{ label: 'Git' },
	{ label: 'Vue' },
	{ label: 'TailwindCSS' },
];

const TechItem = ({
	label
}: ISocialItem) => (
    <span className='bg-cyan-400 text-black px-3 py-1 rounded-full text-xs lg:text-sm font-semibold'>
		{label}
    </span>
);

const TechLists = () => {
	return (
		<div className='flex flex-col py-4'>
			<h3 className="text-xl font-semibold mb-2">Skill</h3>
			<div className="flex flex-wrap justify-center lg:justify-start gap-2">
				{techItems.map((item, index) => (
					<TechItem label={item.label} key={index} />
				))}
			</div>
		</div>
	);
};

export default TechLists;
