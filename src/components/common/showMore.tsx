'use client'
import * as React from 'react';

interface IProps {
    text?: string;
};

const ShowMore = ({ text }: IProps) => {
	const [ isExpanded, setIsExpanded ] = React.useState(false);

	const handleToggle = () => {
        setIsExpanded(!isExpanded);
    };

	return (
		<div className='relative overflow-hidden'>
            <div className={`transition-all duration-700 ${isExpanded ? 'max-h-96' : 'max-h-0'} overflow-hidden`}>
                <span className='text-sm md:text-base'>{text}</span>
            </div>
            <button onClick={handleToggle} className="text-cyan-400 mt-1">
                {isExpanded ? 'Less' : 'More'}
            </button>
		</div>
	);
};

export default ShowMore;
