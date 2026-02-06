import Image from 'next/image';
import * as motion from "motion/react-client";
import { SocialLinks, TechLists, DownloadButton } from "@/components/common";
import AboutSection from "@/components/sections/AboutSection";
import ProjectsSection from "@/components/sections/ProjectsSection";
import Tenggis from '../../public/Tenggis.png';

const fadeInUpVariant = {
	hidden: { opacity: 0, y: 20 },
	visible: { opacity: 1, y: 0 }
};

const imageContainerVariants = {
	hidden: { opacity: 0, scale: 0.8 },
	visible: { 
		opacity: 1, 
		scale: 1,
		transition: {
			duration: 0.8
		}
	}
};

export default function Home() {
	return (
		<main className="flex flex-col items-center">
			<section id='home' className="w-full max-w-7xl p-5 pt-24 min-h-screen md:h-screen">
				<div className='flex flex-col lg:flex-row gap-4 justify-center items-center h-full'>
					<motion.div 
						variants={imageContainerVariants}
						initial="hidden"
						animate="visible"
						className="flex-1 flex relative justify-end items-center lg:order-2 select-none"
					>
						<div className="relative">
							<motion.div
								className="absolute inset-0 rounded-full bg-linear-to-r from-cyan-500 to-purple-500"
								style={{ padding: '3px', filter: 'blur(1px)' }}
								animate={{ transform: ['rotate(0deg)', 'rotate(360deg)'] }}
								transition={{ repeat: Infinity, repeatType: "loop", duration: 3 }}
							/>
							<div className="relative rounded-full p-1 bg-black/50 backdrop-blur-sm">
								<Image
									src={Tenggis}
									alt='profile'
									className="w-48 lg:w-80 object-cover rounded-full"
								/>
							</div>
						</div>
					</motion.div>
					<motion.div 
						initial={{ opacity: 0, x: -100 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.8 }}
						className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1"
					>
						<motion.h1 
							initial={{ opacity: 0, y: -20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.5, duration: 0.8 }}
							className="text-3xl lg:text-6xl font-light select-none"
						>
							Hello, {"I'm"} <span className='text-cyan-400 font-medium'>Tenggis Munkhbaatar</span>
						</motion.h1>
						<motion.p 
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ delay: 1, duration: 0.8 }}
							className='text-xl lg:text-3xl font-light select-none'
						>
							{"Front-end/Full-stack developer who's all about making user experiences awesome. I love creating websites that feel just right!"}
						</motion.p>
						<motion.div
							variants={fadeInUpVariant}
							initial="hidden"
							animate="visible"
							transition={{ delay: 1.5, duration: 0.8 }}
						>
							<TechLists />
						</motion.div>
						<motion.div
							variants={fadeInUpVariant}
							initial="hidden"
							animate="visible"
							transition={{ delay: 1.8, duration: 0.8 }}
						>
							<SocialLinks />
						</motion.div>
						<motion.div
							variants={fadeInUpVariant}
							initial="hidden"
							animate="visible"
							transition={{ delay: 2.1, duration: 0.8 }}
							whileHover={{ scale: 1.05 }}
						>
							<DownloadButton />
						</motion.div>
					</motion.div>
				</div>
			</section>

			<section id="about" className="w-full max-w-7xl p-5">
				<AboutSection />
			</section>

			<section id="projects" className="w-full max-w-7xl p-5">
				<ProjectsSection />
			</section>
		</main>
	);
};
