'use client'
import * as React from 'react';
import axios from 'axios';
import { CommentForm, CommentList } from '../comment';

const Contact: React.FC = () => {
    const [comments, setComments] = React.useState<IComment[]>([]);

    React.useEffect(() => {
        const fetchComments = async () => {
            try {
                const response = await axios.get<IComment[]>('/api/comments');
                setComments(response.data);
            } catch (error) {
                console.error('Error fetching comments:', error);
            }
        };
      
        fetchComments();
    }, []);

    const handleCommentSubmit = (newComment: IComment) => {
        setComments((prevComments) => [...prevComments, newComment]);
    };
    
    const handleCommentDelete = async (id: string) => {
        try {
            await axios.delete(`/api/comments?id=${id}`);
            setComments((prevComments) => prevComments.filter(comment => comment.id !== id));
        } catch (error) {
            console.error('Error deleting comment:', error);
        }
    };

    return (
        <section id='contact' className="w-full max-w-screen-xl px-5 mt-16 mb-40 box-border">
            <span className='md:text-xl text-cyan-400'>Contact me</span>
            <div className="w-full h-px bg-zinc-600 my-8 md:my-12" />
            <CommentForm onSubmit={handleCommentSubmit} />
            <CommentList comments={comments} onDelete={handleCommentDelete} />
        </section>
    );
};

export default Contact;