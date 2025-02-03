'use client'
import * as React from "react";
import Image, { StaticImageData } from "next/image";
import * as motion from "motion/react-client";
import { Bidend, Lann, Tetgeleg, Ubcab, Ubeats } from "../../../public/projects";

interface IProject {
    text: string;
    url: string,
    title: string;
    logo: StaticImageData;
};

const projectItems: IProject[] = [
    {
        title: 'Tetgeleg',
        logo: Tetgeleg,
        url: 'https://tetgeleg.mn/',
        text: 'Helps students and organizations connect with each other. Gives everyone equal chance for better education and especially those who are in rural area. My part was in the back-office and also the web app, where students can read articles with tips for getting into their dream schools. We even set up events for students to meet up and build a community.',
    },
    {
        title: 'Lann',
        logo: Lann,
        url: 'https://lann.mn/',
        text: 'Buy, sell, and trade skins easier and faster. All deals are secured with the highest level protection methods. Our main goal is to make sure all trades are safe and scam-free. We act as a third-party to oversee the trades, ensuring everything is fair and secure.',
    },
    {
        title: 'Ubcab',
        logo: Ubcab,
        url: 'https://ubcab.mn/',
        text: 'A company plans to provide services in the public transport sector, expand its services to enterprises, and launch an IPO. The platform will cater to all types of transportation needs throughout Mongolia 24/7. Additional services, such as hand-to-hand delivery, car rental, and designated drivers, are also available.',
    },
    {
        title: 'Ubeats',
        logo: Ubeats,
        url: 'https://ubeats.mn/',
        text: "I worked on an office food delivery service, designed to make life easier for busy office workers. Plus, we've got a DarkStore and Darkkitchen, all unnecessary expenses are reduced, and quality food at competitive, affordable prices can be provided and be promptly delivered to your location. It's all about bringing tasty, convenient lunches right to your desk! The cool part is, it's integrated with our cab system, so delivery is super smooth and reliable.",
    },
    {
        title: 'Bidend',
        logo: Bidend,
        url: 'https://bidend.mn/',
        text: 'Intermediary and unnecessary costs will be reduced by offering an open auction platform for trade and asset management, and it will bring increased capital flows and accelerated economic circulation.',
    }
];

const Projects = () => {
    return (
        <div className="py-12">
            <h2 className="text-3xl lg:text-5xl font-semibold text-center lg:text-start select-none text-cyan-400 mb-12">
                Previous Projects
            </h2>
    
            <div className="space-y-6 lg:space-y-10">
                {projectItems.map((project, index) => (
                    <motion.a
                        key={project.title}
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50, y: 50 }}
                        whileInView={{ opacity: 1, x: 0, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: index * 0.2 }}
                        className="block bg-[#222227] hover:bg-[#2c2c31] p-5 sm:p-7 rounded-xl shadow shadow-pink-400 transition-all duration-300 select-none"
                    >
                        <div className="flex gap-2 items-center">
                            <Image
                                src={project.logo}
                                alt={project.title}
                                className="w-16 sm:w-20 object-contain rounded-full"
                            />
                        </div>
                        <p className="mt-2 text-gray-300 text-[0.95rem] lg:text-lg">
                            {project.text}
                        </p>
                    </motion.a>
                ))}
            </div>
        </div>
    );
};

export default Projects;
