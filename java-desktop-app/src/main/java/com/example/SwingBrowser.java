package com.example;

import javax.swing.*;
import java.awt.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.net.MalformedURLException;

import javafx.application.Platform;
import javafx.concurrent.Worker;
import javafx.embed.swing.JFXPanel;
import javafx.scene.Scene;
import javafx.scene.web.WebEngine;
import javafx.scene.web.WebView;
import netscape.javascript.JSObject;

public class SwingBrowser extends JFrame {

    private final JFXPanel jfxPanel = new JFXPanel();
    private WebEngine webEngine;

    // --- NEW: Make the JavaBridge a permanent instance variable ---
    // This gives it a strong reference and prevents the garbage collector
    // from removing it after the page loads. This is the key fix.
    private final JavaBridge bridge = new JavaBridge();

    private static final String APP_INDEX_PATH = "C:/Users/Anish/my-calculator/dist/index.html";
    private static final String URL_TO_LOAD = getLocalAppUrl(APP_INDEX_PATH);

    // This is the bridge class that JavaScript will call
    public class JavaBridge {
        public void saveFile(String content, String fileName) {
            System.out.println("[JAVA] saveFile method called for: " + fileName);
            SwingUtilities.invokeLater(() -> {
                JFileChooser fileChooser = new JFileChooser();
                fileChooser.setDialogTitle("Save File");
                fileChooser.setSelectedFile(new File(fileName));

                int userSelection = fileChooser.showSaveDialog(SwingBrowser.this);

                if (userSelection == JFileChooser.APPROVE_OPTION) {
                    File fileToSave = fileChooser.getSelectedFile();
                    try (FileWriter fileWriter = new FileWriter(fileToSave)) {
                        fileWriter.write(content);
                        System.out.println("Successfully saved file: " + fileToSave.getAbsolutePath());
                    } catch (IOException ex) {
                        ex.printStackTrace();
                        JOptionPane.showMessageDialog(SwingBrowser.this, "Error saving file: " + ex.getMessage(),
                                "Error", JOptionPane.ERROR_MESSAGE);
                    }
                }
            });
        }
    }

    public SwingBrowser() {
        super("My React Desktop App");
        initComponents();
    }

    private static String getLocalAppUrl(String localPath) {
        try {
            File file = new File(localPath);
            if (file.exists()) {
                return file.toURI().toURL().toString();
            } else {
                return "data:text/html,<h1>Error</h1><p>index.html not found</p>";
            }
        } catch (MalformedURLException e) {
            e.printStackTrace();
            return "data:text/html,<h1>Error</h1><p>MalformedURLException</p>";
        }
    }

    private void initComponents() {
        createScene();
        setLayout(new BorderLayout());
        add(jfxPanel, BorderLayout.CENTER);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(1280, 800);
        setLocationRelativeTo(null);
    }

    private void createScene() {
        Platform.runLater(() -> {
            WebView view = new WebView();
            webEngine = view.getEngine();
            webEngine.setJavaScriptEnabled(true);

            webEngine.setOnAlert(event -> SwingUtilities.invokeLater(() -> JOptionPane.showMessageDialog(this,
                    event.getData(), "Message from Web Page", JOptionPane.INFORMATION_MESSAGE)));

            webEngine.getLoadWorker().stateProperty().addListener(
                    (ov, oldState, newState) -> {
                        if (newState == Worker.State.SUCCEEDED) {
                            System.out.println("[DEBUG] Page load SUCCEEDED. Attempting to inject Java bridge...");
                            JSObject window = (JSObject) webEngine.executeScript("window");

                            // --- NEW: Use the permanent bridge object ---
                            // Instead of creating a new one, we use the one we saved.
                            window.setMember("javaBridge", bridge);

                            System.out.println("[DEBUG] Java bridge injected successfully.");
                        }
                    });

            System.out.println("Attempting to load URL: " + URL_TO_LOAD);
            webEngine.load(URL_TO_LOAD);
            jfxPanel.setScene(new Scene(view));
        });
    }

    public static void main(String[] args) {
        SwingUtilities.invokeLater(() -> {
            SwingBrowser browser = new SwingBrowser();
            browser.setVisible(true);
        });
    }
}
