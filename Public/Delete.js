const deleteBtn = document.getElementsByClassName('deleteButton');
for(i=0; i < deleteBtn.length; i++) {
    deleteBtn[i].addEventListener('click', async (e) => {
        const postId = e.target.getAttribute("data-postId")
        const response = await fetch(`/BlogView/delete-post/${postId}`, {
            method: "DELETE",
            credentials: "include",
            redirect: "follow"
        })
        window.location.reload()
    }
)};