import Image from 'next/image';
import * as motion from "motion/react-client";
import { AnimatePresence } from 'motion/react';
import { SocialLinks, TechLists, DownloadButton } from "@/components/common";
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
			duration: 0.8,
			ease: "easeOut"
		}
	}
};

export default function Home() {
	return (
		<AnimatePresence>
			<section id='home' className="w-full max-w-screen-xl p-5 h-screen">
				<div className='flex flex-col lg:flex-row gap-4 justify-center items-center h-full'>
					<motion.div 
						variants={imageContainerVariants}
						initial="hidden"
						animate="visible"
						className="flex-1 flex relative justify-end items-center lg:order-2 select-none"
					>
						<motion.div
							className="relative"
							whileHover={{ scale: 1.05 }}
							transition={{ type: "spring", stiffness: 300, damping: 20 }}
						>
							<div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500 to-purple-500" 
								style={{ padding: '3px', filter: 'blur(1px)' }}
							/>
							<div className="relative rounded-full p-1 bg-black/50 backdrop-blur-sm">
								<Image
									src={Tenggis}
									alt='profile'
									className="w-48 lg:w-80 object-cover rounded-full"
								/>
							</div>
						</motion.div>
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
							{"Front-end developer who's all about making user experiences awesome. I love creating websites that feel just right!"}
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
		</AnimatePresence>
	);
};
