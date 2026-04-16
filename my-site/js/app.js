import { initReadingModule } from "./reading.js";

function setupNavigation() {
  const buttons = document.querySelectorAll(".menu-btn");
  const pages = document.querySelectorAll(".page");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.page;

      buttons.forEach((btn) => btn.classList.remove("active"));
      pages.forEach((page) => page.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
}

function initApp() {
  setupNavigation();
  initReadingModule();
  console.log("主程序已启动");
}

document.addEventListener("DOMContentLoaded", initApp);