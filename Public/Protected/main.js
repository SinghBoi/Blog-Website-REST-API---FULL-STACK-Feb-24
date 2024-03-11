document
  .getElementById("createPostForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault(); // Prevent the default form submission behavior

    try {
      // Make an API request to create a new post
      const response = await fetch("/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: document.getElementById("title").value,
          content: document.getElementById("content").value,
        }),
      });

      const data = await response.json();

      // Update the displayed blog posts after creating a new post
      displayBlogPosts(data);

      // Clear the form
      document.getElementById("createPostForm").reset();
    } catch (error) {
      console.error("Error creating blog post:", error);
    }
  });

document.getElementById("logout-button").addEventListener("click", function () {
  try {
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/";
    alert("Logged out successfully!");
  } catch (error) {
    console.error("Error logging out", error);
  }
});

function displayBlogPosts(blogPosts) {
  const blogPostsContainer = document.getElementById("blogPostsContainer");
  blogPostsContainer.innerHTML = "";

  if (blogPosts.length === 0) {
    blogPostsContainer.innerHTML = "<p>No blog posts available</p>";
    return;
  }

  const sortedBlogPosts = blogPosts.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  sortedBlogPosts?.forEach((post) => {
    const postHtml = `
                    <div class="blog-post">
                        <h3>${post.title}</h3>
                        <p>${post.content}</p>
                        <p>Author: ${post.author}</p>
                        <p>Timestamp: ${post.timestamp}</p>
                        <form class="comment-form" action="/comment" method="post">
                            <input type="hidden" name="postId" value="${post.id
      }">
                            <textarea name="commentContent" placeholder="Your Comment" rows="3" required>
                            </textarea><br>
                            <input type="submit" value="Post Comment">
                        </form>
                        
                        <h4>Comments:</h4>
                        <ul>
                            ${post?.comments
        ?.map(
          (comment) =>
            `<li>${comment.author}: ${comment.content} (${comment.timestamp})</li>`
        )
        .join("")}
                        </ul>
                    </div>
                `;
    blogPostsContainer.innerHTML += postHtml;
  });
}

async function updateBlogPosts() {
  try {
    const response = await fetch("/getBlogPosts");
    const data = await response.json();
    displayBlogPosts(data);
  } catch (error) {
    console.error("Error fetching blog posts:", error);
  }
}

async function fetchBlogPosts() {
  try {
    const response = await fetch("/getBlogPosts");
    return await response.json();
  } catch (error) {
    console.error("Error fetching blog posts:", error);
  }
}

// Function to update and display blog posts
async function updateAndDisplayBlogPosts() {
  const data = await fetchBlogPosts();
  displayBlogPosts(data);
}

// Function to fetch logged-in user from the backend
async function fetchLoggedInUser() {
  try {
    const response = await fetch("/getLoggedInUser");
    const data = await response.json();
    const loginSection = document.getElementById("username");
    loginSection.innerHTML = data.username;
  } catch (error) {
    console.error("Error fetching logged-in user:", error);
  }
}

// Initial update of blog posts and logged-in user when the page loads
document.addEventListener("DOMContentLoaded", async function () {
  fetchLoggedInUser();
  await updateAndDisplayBlogPosts();
});
