// Header module functionality
export const initHeader = () => {
  console.log("Header module initialized");

  // Add any custom functionality here
  const header = document.querySelector("header");
  if (header) {
    // For example, add a scroll effect
    window.addEventListener("scroll", () => {
      if (window.scrollY > 50) {
        header.classList.add("bg-blue-800");
        header.classList.remove("bg-blue-600");
      } else {
        header.classList.add("bg-blue-600");
        header.classList.remove("bg-blue-800");
      }
    });
  }
};

// Initialize when the module loads
document.addEventListener("DOMContentLoaded", initHeader);
