"use client"
import Image from "next/image";
import * as React from "react";
import * as motion from "motion/react-client";
import { Smile } from "../../../public/common";

interface IExpEdu {
    duration: string;
    title: string;
    position: string;
    description?: string;
};

const expEdu: IExpEdu[] = [
	{
        duration: '2017-2021',
        title: 'Mongolian University of Science and Technology',
        position: 'Bachelor Degree of Software Engineering'
    },
    {
        duration: '2020-2021',
        title: 'Starsoft LLC',
        position: 'Jr. Front-end Engineer',
        description: 'I worked on an EduTech platform, building interactive features like presentation creation and conversion, as well as live classes, using Vue.js and Node.js. I also developed a back-office system for managing classes, students, and teacher accounts, ensuring smooth administration and user experience.'
    },
    {
        duration: '2021-2024',
        title: 'Mezorn Technology LLC',
        position: 'Front-end Engineer',
        description: 'I developed and maintained four scalable back-office systems serving over 2 million users, using React.js, Next.js, and TypeScript. I built reusable components that improved development efficiency, integrated Jest and React Testing Library for testing, and optimized UI performance and SEO. Working in an agile (Scrum) environment, I collaborated closely with backend engineers to implement seamless API integrations and transformed Figma designs into responsive, production-ready solutions.'
    }
];

export default function About() {
	return (
		<>
            <div className='flex flex-col lg:flex-row py-12 gap-4 justify-center items-center'>
				<div className="flex-1 flex relative justify-end items-center lg:order-2 select-none">
                    <Image
                        src={Smile}
                        alt='fun-image_02'
                        className="w-48 lg:w-80 object-cover rounded-3xl shadow-2xl shadow-cyan-900"
                    />
				</div>
				<div className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1">
					<h2 className="text-2xl lg:text-5xl font-semibold select-none text-cyan-400">
						About me
					</h2>
					<p className='text-lg lg:text-2xl font-light select-none'>
                        Frontend Engineer with over +3 years of experience in building reliable and user-friendly web applications. Proficient in
                        <span className="font-semibold text-cyan-400"> React, Next.js, </span>
                        and <span className="font-semibold text-cyan-400">TypeScript,</span> with a focus on creating clean, maintainable code and responsive designs. I enjoy collaborating with teams to solve complex problems and continuously learning to improve my skills and contribute to meaningful projects.
					</p>
				</div>
			</div>
            <div className="w-full my-12 text-center">
                <h2 className="text-2xl lg:text-4xl font-semibold select-none text-cyan-400 mb-12">Experience & Education</h2>
                <div className="relative border-l border-gray-700 pl-4 sm:pl-6 space-y-10">
                    {expEdu.map((exp, index) => (
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
