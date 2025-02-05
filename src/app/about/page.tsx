"use client"
import Image from "next/image";
import * as React from "react";
import * as motion from "motion/react-client";
import { Smile } from "../../../public/common";

export default function About() {
    const [ experience, setExperience ] = React.useState<IExperience[]>([]);

    React.useEffect(() => {
        fetch("/experience.json")
            .then(res => res.json())
            .then(data => setExperience(data));
    }, []);

	return (
		<>
            <div className='flex flex-col lg:flex-row py-12 gap-4 justify-center items-center'>
				<div className="flex-1 flex relative justify-end items-center lg:order-2 select-none">
                    <Image
                        src={Smile}
                        alt='fun-image_02'
                        className="w-48 lg:w-80 object-cover rounded-3xl shadow-2xl shadow-pink-900"
                    />
				</div>
				<div className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1">
					<h2 className="text-2xl lg:text-5xl font-semibold select-none text-cyan-400">
						About me
					</h2>
					<p className='text-lg lg:text-2xl font-light select-none'>
                        Frontend Engineer with over
                        <span className="font-semibold text-cyan-400"> +3 years </span>
                        of experience in building reliable and user-friendly web applications. Proficient in
                        <span className="font-semibold text-cyan-400"> React, Next.js, </span>
                        and <span className="font-semibold text-cyan-400">TypeScript,</span> with a focus on creating clean, maintainable code and responsive designs. I enjoy collaborating with teams to solve complex problems and continuously learning to improve my skills and contribute to meaningful projects.
					</p>
				</div>
			</div>
            <div className="w-full my-12 text-center">
                <h2 className="text-2xl lg:text-4xl font-semibold select-none text-cyan-400 mb-12">Experience & Education</h2>
                <div className="relative border-l border-gray-700 pl-4 sm:pl-6 space-y-10">
                    {experience.map((exp, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.2 }}
                            className="bg-[#222227] hover:bg-[#2c2c31] p-4 sm:p-6 rounded-xl shadow shadow-pink-400 relative transition-all duration-300 select-none"
                        >
                            <span className="absolute -left-2 sm:-left-3 w-4 sm:w-6 h-4 sm:h-6 bg-cyan-400 rounded-full border border-gray-900"></span>
                            <h3 className="text-lg sm:text-xl font-semibold">{exp.position}</h3>
                            <p className="text-xs sm:text-sm text-gray-400">{exp.title} • {exp.duration}</p>
                            <p className="mt-2 text-gray-300 text-sm sm:text-base">{exp.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
		</>
	);
};
