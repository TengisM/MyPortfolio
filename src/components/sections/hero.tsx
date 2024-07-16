import Image from 'next/image';
import Tenggis from '../../../public/Tenggis.png';
import { DownArrow } from '../../../public/common';
import './hero.css';

export default function Hero() {
    return (
        <section className="w-full max-w-screen-xl p-5 h-screen">
            <div className='flex flex-col md:flex-row gap-4 justify-center items-center h-full'>
                <div className="flex-1 flex relative justify-end items-center md:order-2">
                    <Image
                        src={Tenggis}
                        alt='profile'
                        className="w-48 md:w-80 cursor-help object-cover transition-all duration-300 filter md:blur md:hover:blur-none"
                    />
                </div>
                <div className="flex-1 flex flex-col md:justify-center items-center text-center md:text-left md:order-1">
                    <h1 className="hero-span text-3xl md:text-6xl font-light cursor-default">
                        <span>Hi, </span>
                        <span>I'm </span>
                        <span className='text-cyan-400'>Tenggis</span>
                        <span>, a </span>
                        <span>front</span>
                        <span>-</span>
                        <span>end </span>
                        <span>developer.</span>
                    </h1>
                </div>
            </div>
            <Image
                src={DownArrow}
                alt='down'
                className='animate-bounce w-6 mx-auto -mt-10'
            />
        </section>
    );
};
