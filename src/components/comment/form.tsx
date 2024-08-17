'use client'
import * as React from 'react';
import axios from 'axios';

interface ICommentFormProps {
    onSubmit: (newComment: IComment) => void;
};

const CommentForm: React.FC<ICommentFormProps> = ({ onSubmit }) => {
    const [comment, setComment] = React.useState<string>('');
  
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (comment.trim()) {
            try {
                const response = await axios.post<IComment>('/api/comments', { text: comment });
                onSubmit(response.data);
                setComment('');
            } catch (error) {
                console.error('Error submitting comment:', error);
            }
        }
    };
  
    return (
        <form className='relative w-full border rounded-lg p-1' onSubmit={handleSubmit}>
            <textarea
                className='w-full bg-transparent focus:outline-none p-2 border-b'
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment..."
                required
            />
            <button className='p-2 border border-cyan-400 rounded-full hover:bg-cyan-400/30 transition duration-300' type="submit">Comment</button>
        </form>
    );
};

export default CommentForm;
