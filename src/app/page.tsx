import Image from 'next/image';
import { SocialLinks, TechLists, DownloadButton } from "@/components/common";
import Tenggis from '../../public/Tenggis.png';

export default function Home() {
	return (
		<section id='home' className="w-full max-w-screen-xl p-5 h-screen">
			<div className='flex flex-col lg:flex-row gap-4 justify-center items-center h-full'>
				<div className="flex-1 flex relative justify-end items-center lg:order-2 select-none">
					<Image
						src={Tenggis}
						alt='profile'
						className="w-48 lg:w-80 object-cover"
					/>
				</div>
				<div className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1">
					<h1 className="text-3xl lg:text-6xl font-light select-none">
						Hello, I'm <span className='text-cyan-400 font-medium'>Tenggis Munkhbaatar</span>
					</h1>
					<p className='text-xl lg:text-3xl font-light select-none'>
						{"Front-end developer who's all about making user experiences awesome. I love creating websites that feel just right!".split("").map((char, index) => (
							<span
								key={index}
								className="animate-fade-in-scale"
								style={{ animationDelay: `${index * 0.025}s` }}
							>
								{char}
							</span>
						))}
					</p>
					<TechLists />
					<SocialLinks />
					<DownloadButton />
				</div>
			</div>
		</section>
	);
};
