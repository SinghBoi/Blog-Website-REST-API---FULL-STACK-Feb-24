const deleteBtn = document.getElementsByClassName("delete");
for (i = 0; i < deleteBtn.length; i++) {
    deleteBtn[i].addEventListener('click', async (e) => {
        const postId = e.target.getAttribute("data-postId")
        await fetch(`/Main/delete/${postId}`, {
            method: "DELETE",
            credentials: "include",
            redirect: "follow"
        })
        window.location.reload()
    }
    )
};