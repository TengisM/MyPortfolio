'use client'
import * as React from "react";
import * as motion from "motion/react-client";
import axios from "axios";

const ProjectsSection = () => {
    const [ projects, setProjects ] = React.useState<IProject[]>([]);

    const fetchProjects = async () => {
        try {
            const response = await axios.get<IProject[]>("/projects.json");
            setProjects(response.data);
        } catch (error) {
            console.error("Error fetching projects:", error);
        }
    };

    React.useEffect(() => {
        fetchProjects();
    }, []);

    return (
        <div className="py-12">
            <h2 className="text-2xl lg:text-4xl font-semibold text-center lg:text-start text-cyan-400 underline mb-12 cursor-default">
                My Projects
            </h2>
    
            <div className="space-y-6 lg:space-y-10">
                {projects.map((project, index) => (
                    <motion.a
                        key={project.title}
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        whileTap={{ scale: 0.97 }}
                        viewport={{ once: true, margin: "0px 0px -100px 0px" }}
                        transition={{ duration: 0.45, delay: index * 0.08 }}
                        className="
                            group block cursor-pointer bg-neutral-900/50 backdrop-blur-md p-5 sm:p-7 rounded-xl border border-cyan-400/20 will-change-transform
                            transition-[border-color,box-shadow,transform] duration-300
                            hover:border-cyan-400/60 hover:shadow-[0_0_30px_-10px_rgba(211,34,238,0.4)]
                        "
                    >
                        <div className="flex justify-between items-center">
                            <img
                                src={project.logo}
                                alt={project.title}
                                className="w-16 md:w-20 h-auto opacity-90 group-hover:opacity-100 transition-opacity"
                            />
                            <span className="text-cyan-400 font-semibold group-hover:translate-x-1 transition-transform duration-200">
                                →
                            </span>
                        </div>
                        <p className="mt-4 text-gray-300 text-sm lg:text-base leading-relaxed">
                            {project.text}
                        </p>
                    </motion.a>
                ))}
            </div>
        </div>
    );
};

export default ProjectsSection;
