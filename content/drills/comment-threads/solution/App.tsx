import { useState } from "react";
import { fetchComments, type Comment } from "./api";

const POSTS = [
  { id: 1, title: "Alpha" },
  { id: 2, title: "Beta" },
  { id: 3, title: "Gamma" },
];

export default function App() {
  const [openPostId, setOpenPostId] = useState<number | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});
  const threadsLoaded = Object.keys(commentsByPost).length;

  function showComments(postId: number) {
    setOpenPostId(postId);
    if (commentsByPost[postId]) return;
    fetchComments(postId).then((data) => {
      setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
    });
  }

  return (
    <main>
      <p>{`Threads loaded: ${threadsLoaded}`}</p>
      {POSTS.map((post) => {
        const comments = commentsByPost[post.id];
        return (
          <section key={post.id} aria-label={post.title}>
            <h2>{post.title}</h2>
            <button type="button" onClick={() => showComments(post.id)}>
              {`Show comments for ${post.title}`}
            </button>
            {openPostId === post.id &&
              (comments ? (
                <ul>
                  {comments.map((comment) => (
                    <li key={comment.id}>{comment.body}</li>
                  ))}
                </ul>
              ) : (
                <p>Loading comments…</p>
              ))}
          </section>
        );
      })}
    </main>
  );
}
