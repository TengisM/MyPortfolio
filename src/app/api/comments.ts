import type { NextApiRequest, NextApiResponse } from 'next';

let comments: IComment[] = [];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        res.status(200).json(comments);
    } else if (req.method === 'POST') {
        const newComment: IComment = {
            text: req.body.text,
            id: Date.now().toString(),
            timestamp: Date.now(),
        };
        comments.push(newComment);
        res.status(201).json(newComment);
    } else if (req.method === 'DELETE') {
        const { id } = req.query;
        comments = comments.filter(comment => comment.id !== id);
        res.status(204).end();
    } else {
        res.status(405).end();
    }
};
