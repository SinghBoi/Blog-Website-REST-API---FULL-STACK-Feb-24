document.addEventListener("DOMContentLoaded", function () {
  // Add an event listener to the login form
  document
    .getElementById("loginForm")
    .addEventListener("submit", async function (event) {
      event.preventDefault(); // Prevent the default form submission behavior

      // Fetch the form data
      const formData = new FormData(this);
      const username = formData.get("username");
      const password = formData.get("password");

      // Make an API request to the login endpoint
      try {
        const response = await fetch("/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        if (response.ok) {
          // If login is successful, you can redirect or perform other actions
          window.location.href = "/protected";
          alert("Welcome " + username);
        } else {
          // If login fails, display an alert with the error message
          const errorMessage = await response.text();
          alert(errorMessage);
        }
        document.getElementById("loginForm").reset();
      } catch (error) {
        console.error("Error during login:", error);
      }
    });
    
  document
    .getElementById("registerForm")
    .addEventListener("submit", async function (event) {
      event.preventDefault(); // Prevent the default form submission behavior

      // Fetch the form data
      const formData = new FormData(this);
      const username = formData.get("username");
      const password = formData.get("password");

      // Make an API request to the register endpoint
      try {
        const response = await fetch("/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        if (response.ok) {
          // If registration is successful, you can redirect or perform other actions
          alert("Registered Successfully");
        } else {
          // If registration fails, display an alert with the error message
          const errorMessage = await response.text();
          alert(errorMessage);
        }
        document.getElementById("registerForm").reset();
      } catch (error) {
        console.error("Error during registration:", error);
      }
    });
});
