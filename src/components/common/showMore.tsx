'use client'
import * as React from 'react';
import Image from 'next/image';
import { DownArrow } from '../../../public/common';

interface IProps {
    text?: string;
};

const ShowMore = ({ text }: IProps) => {
	const [ isExpanded, setIsExpanded ] = React.useState(false);

	const handleToggle = () => {
        setIsExpanded(!isExpanded);
    };

	return (
		<div className='relative overflow-hidden w-full space-y-4'>
            <div className={`transition-all duration-700 ${isExpanded ? 'max-h-96' : 'max-h-0'} overflow-hidden`}>
                <span className='text-sm md:text-base'>{text}</span>
            </div>
            <button onClick={handleToggle} className="w-full">
                <Image
                    src={DownArrow}
                    alt='down'
                    className={`w-4 mx-auto ${isExpanded ? 'rotate-180' : '' }`}
                />
            </button>
		</div>
	);
};

export default ShowMore;
