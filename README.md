# Boolean Rhapsody 🎵

## 🚀 Project Description

Boolean Rhapsody is a modern, feature-rich graphing calculator built with a unique architecture. It combines a robust Java desktop application front-end with a dynamic and interactive user interface powered by React.

The core of the application is a Java Swing window that embeds a JavaFX WebView component. This WebView acts as a mini-browser, rendering a sophisticated calculator UI built as a standalone React web application. This hybrid approach allows for the creation of a native desktop experience with the power and flexibility of modern web development tools.

## ✨ Features

* **Interactive Graphing:** Plot multiple, color-coded equations on a pannable and zoomable canvas.
* **Real-time Analysis:**
    * Calculate definite integrals and visualize the area under the curve.
    * Find and display intersection points between any two functions.
    * Identify and plot local maxima, minima, and inflection points.
* **Dynamic UI:** A smooth and responsive interface built with React and styled with Tailwind CSS.
* **Desktop Integration:**
    * Save and export your graph and workspace directly to your computer.
    * Load previously saved workspaces to continue your work.
* **Customization:** Toggle between light and dark modes for comfortable viewing.

## 🛠️ Tech Stack

* **Desktop Application (The "Browser"):**
    * **Java:** Core programming language.
    * **Java Swing:** For the main application window (`JFrame`).
    * **JavaFX:** For the `WebView` component used to render the web UI.
    * **Maven:** For managing Java dependencies.
* **User Interface (The "Calculator"):**
    * **React:** For building the component-based user interface.
    * **Vite:** As the modern, fast build tool for the React app.
    * **Tailwind CSS:** For utility-first CSS styling.
    * **math.js:** For parsing and evaluating mathematical expressions.
    * **lucide-react:** For clean and simple icons.

## 🏃 How to Run

This project consists of two separate parts that work together. You must first build the React UI, and then run the Java application that displays it.

### Part 1: Build the React UI (`my-calculator`)

1.  **Navigate to the calculator directory:**
    ```bash
    cd my-calculator
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create the production build:**
    ```bash
    npm run build
    ```
    This command will create a `dist` folder inside `my-calculator`. This folder contains the complete, static website for the calculator.

### Part 2: Run the Java Browser (`DEMO1`)

1.  **Open the Java project:** Open the `DEMO1` folder in your favorite Java IDE (like IntelliJ, Eclipse, or VS Code with Java extensions).
2.  **Verify the file path:** Open the `SwingBrowser.java` file. Find the `APP_INDEX_PATH` variable and make sure it points to the `index.html` file that was just created in the previous step. The path should look like this (adjusted for your username):
    ```java
    private static final String APP_INDEX_PATH = "D:/BooleanRhapsody/my-calculator/dist/index.html";
    ```
3.  **Run the application:** Run the `SwingBrowser.java` file from your IDE. The desktop window should appear, displaying the graphing calculator.

### 📂 Project Structure

The repository is organized as a monorepo with two main packages:

```
/
├── DEMO1/            # The Java Swing/JavaFX desktop application
└── my-calculator/    # The React.js graphing calculator UI
