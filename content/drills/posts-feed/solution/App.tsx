import { useEffect, useState } from "react";
import { fetchComments, fetchPosts, fetchUsers, type Comment, type Post, type User } from "./api";

interface PostRowProps {
  post: Post;
  author: string | undefined;
  liked: boolean;
  open: boolean;
  comments: Comment[] | undefined;
  failed: boolean;
  onLike: () => void;
  onShowComments: () => void;
}

function PostRow({ post, author, liked, open, comments, failed, onLike, onShowComments }: PostRowProps) {
  const [pinned, setPinned] = useState(false);

  return (
    <section aria-label={post.title}>
      <h2>{post.title}</h2>
      <p>{`Author: ${author ?? "…"}`}</p>
      <label>
        <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
        {` Pin ${post.title}`}
      </label>{" "}
      <button type="button" onClick={onLike}>
        {`${liked ? "Unlike" : "Like"} ${post.title}`}
      </button>{" "}
      <button type="button" onClick={onShowComments}>
        {`Show comments for ${post.title}`}
      </button>
      {open &&
        (comments ? (
          <ul>
            {comments.map((comment) => (
              <li key={comment.id}>{comment.body}</li>
            ))}
          </ul>
        ) : failed ? (
          <p role="alert">Could not load comments</p>
        ) : (
          <p>Loading comments…</p>
        ))}
    </section>
  );
}

export default function App() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [likedIds, setLikedIds] = useState<number[]>([]);
  const [openPostId, setOpenPostId] = useState<number | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});
  const [failedPostIds, setFailedPostIds] = useState<number[]>([]);
  const [newestFirst, setNewestFirst] = useState(false);
  const threadsLoaded = Object.keys(commentsByPost).length;

  useEffect(() => {
    fetchPosts().then(setPosts);
    fetchUsers().then(setUsers);
  }, []);

  function toggleLike(postId: number) {
    if (likedIds.includes(postId)) {
      setLikedIds(likedIds.filter((id) => id !== postId));
    } else {
      setLikedIds([...likedIds, postId]);
    }
  }

  function showComments(postId: number) {
    setOpenPostId(postId);
    if (commentsByPost[postId]) return;
    setFailedPostIds((ids) => ids.filter((id) => id !== postId));
    fetchComments(postId).then(
      (data) => {
        setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
        setFailedPostIds((ids) => ids.filter((id) => id !== postId));
      },
      () => {
        setFailedPostIds((ids) => [...ids, postId]);
      }
    );
  }

  const shownPosts = newestFirst ? [...posts].reverse() : posts;

  return (
    <main>
      <p>{`Threads loaded: ${threadsLoaded}`}</p>
      <label>
        <input type="checkbox" checked={newestFirst} onChange={(event) => setNewestFirst(event.target.checked)} />
        {" Newest first"}
      </label>
      {shownPosts.map((post) => (
        <PostRow
          key={post.id}
          post={post}
          author={users.find((user) => user.id === post.userId)?.name}
          liked={likedIds.includes(post.id)}
          open={openPostId === post.id}
          comments={commentsByPost[post.id]}
          failed={failedPostIds.includes(post.id)}
          onLike={() => toggleLike(post.id)}
          onShowComments={() => showComments(post.id)}
        />
      ))}
    </main>
  );
}
