# Advance-Face-Recognition-system
Advanced Face Recognition System using Python, OpenCV, Tkinter, and MySQL. The system captures facial datasets, trains a recognition model, detects multiple faces in real time, identifies registered users, and marks unknown faces automatically through a user-friendly GUI-based application.

## Features
- Real-time face detection
- Multi-face recognition
- Unknown face detection
- Dataset generation
- Face training system
- GUI-based application

## Technologies Used
- Python
- OpenCV
- Tkinter
- NumPy

## How to Run

### Using EXE
Run:
GUI_Face_Recognition.exe

### Using Python
pip install -r requirements.txt
python GUI_Face_Recognition.py

## Workflow
1. Enter Name, Age, Address
2. Click Generate Dataset
3. Click Train Data
4. Click Detect Face

## Database Setup

1. Install MySQL
2. Create database:
   CREATE DATABASE face_recognizer;
3. Import database.sql
4. Update database credentials in GUI_Face_Recognition.py

## Note
Dataset and classifier are not included for privacy reasons.
Users must generate their own dataset and train the model.
