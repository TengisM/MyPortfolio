"use client"
import Image from "next/image";
import * as React from "react";
import axios from "axios";
import * as motion from "motion/react-client";
import { Smile } from "../../../public/common";

const AboutSection = () => {
    const [ experience, setExperience ] = React.useState<IExperience[]>([]);

    const fetchExperience = async () => {
        try {
            const response = await axios.get<IExperience[]>("/experience.json");
            setExperience(response.data);
        } catch (error) {
            console.error("Error fetching experience:", error);
        }
    };

    React.useEffect(() => {
        fetchExperience();
    }, []);

    return (
        <>
            <div className='flex flex-col lg:flex-row py-12 gap-5 justify-center items-center'>
                <div className="flex-1 flex relative justify-end items-center lg:order-2 select-none">
                    <motion.div
                        whileHover={{ scale: 1.05, rotate: 1 }}
                        transition={{ type: "spring", stiffness: 200 }}
                    >
                        <Image
                            src={Smile}
                            alt='fun-image_02'
                            className="w-48 lg:w-80 object-cover rounded-3xl shadow-2xl shadow-pink-900/60"
                        />
                    </motion.div>
                </div>
                <div className="flex-1 flex flex-col gap-4 lg:justify-center items-center lg:items-start text-center lg:text-left lg:order-1">
                    <h2 className="text-2xl lg:text-4xl font-semibold select-none underline text-cyan-400">
                        About me
                    </h2>
                    <p className='text-lg lg:text-2xl font-light select-none'>
                        Frontend / Fullstack engineer with
                        <span className="font-semibold text-cyan-400"> 4+ years </span>
                        of experience building back-office tools and user-facing products. I&apos;ve worked on high-traffic platforms like
                        <span className="font-semibold text-cyan-400"> Tetgeleg, UbCab, UbEats, </span>
                        and DAO analytics at
                        <span className="font-semibold text-cyan-400"> StableLab, </span>
                        using <span className="font-semibold text-cyan-400">React, Next.js, TypeScript, Node.js, PostgreSQL,</span> and modern UI libraries like TailwindCSS and Headless UI. I enjoy turning complex requirements into simple, reliable interfaces and collaborating closely with teams to ship polished, production-ready experiences.
                    </p>
                </div>
            </div>
            <div className="w-full my-12 text-center">
                <h2 className="text-2xl lg:text-4xl font-semibold select-none underline text-cyan-400 mb-12">Experience &amp; Education</h2>
                <div className="relative pl-4 md:pl-6 space-y-12">
                    <div className="absolute left-1 md:left-3 top-0 h-full w-px bg-linear-to-b from-cyan-400/40 via-purple-400/60 to-transparent" />
                    {experience.map((exp, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true, margin: "-80px" }}
                            transition={{ duration: 0.45, delay: index * 0.06 }}
                            className="
                                relative ml-3 md:ml-6 p-5 sm:p-6 rounded-2xl cursor-default bg-neutral-900/50 backdrop-blur-md border border-cyan-400/20
                                hover:border-cyan-400/50 hover:shadow-[0_0_40px_rgba(211,34,238,0.3)] transition-all duration-300
                            "
                        >
                            <span className="absolute -left-8 md:-left-11 top-[45%] w-4 h-4 rounded-full bg-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.8)]"></span>
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

export default AboutSection;
