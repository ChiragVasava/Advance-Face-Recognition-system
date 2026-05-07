import os
import tkinter as tk
from tkinter import messagebox
import cv2
from PIL import Image
import numpy as np
import mysql.connector
import threading
is_training = False
is_detecting = False
# =========================
# WINDOW
# =========================

window = tk.Tk()
window.title("Advanced Face Recognition System")
window.geometry("900x250")

# =========================
# LABELS & ENTRIES
# =========================

l1 = tk.Label(window, text="Name", font=("Algerian", 20))
l1.grid(column=0, row=0, padx=10, pady=10)

t1 = tk.Entry(window, width=40, bd=5)
t1.grid(column=1, row=0)

l2 = tk.Label(window, text="Age", font=("Algerian", 20))
l2.grid(column=0, row=1)

t2 = tk.Entry(window, width=40, bd=5)
t2.grid(column=1, row=1)

l3 = tk.Label(window, text="Address", font=("Algerian", 20))
l3.grid(column=0, row=2)

t3 = tk.Entry(window, width=40, bd=5)
t3.grid(column=1, row=2)

# =========================
# CREATE DATA FOLDER
# =========================

if not os.path.exists("data"):
    os.makedirs("data")

# =========================
# TRAIN CLASSIFIER
# =========================

    
# =========================
# DETECT FACE
# =========================




def train_classifier():

    global is_training

    if is_training:
        messagebox.showinfo(
            "Info",
            "Training already running"
        )
        return

    is_training = True

    b1.config(state="disabled")

    try:

        data_dir = "data"

        if not os.path.exists(data_dir):
            messagebox.showerror(
                "Error",
                "Data folder not found"
            )
            return

        image_paths = [
            os.path.join(data_dir, file)
            for file in os.listdir(data_dir)
            if file.endswith(".jpg")
        ]

        faces = []
        ids = []

        for image_path in image_paths:

            try:

                img = Image.open(image_path).convert('L')

                imageNp = np.array(img, 'uint8')

                # FORCE SAME SIZE
                imageNp = cv2.resize(imageNp, (200, 200))

                id = int(
                    os.path.split(image_path)[1].split(".")[1]
                )

                faces.append(imageNp)

                ids.append(id)

            except Exception as e:

                print("Image Error:", e)

        if len(faces) == 0:

            messagebox.showerror(
                "Error",
                "No valid images found"
            )

            return

        ids = np.array(ids)

        print("Faces Loaded:", len(faces))

        # CREATE MODEL
        clf = cv2.face.LBPHFaceRecognizer_create()

        # TRAIN
        clf.train(faces, ids)

        # DELETE OLD FILE COMPLETELY
        if os.path.exists("classifier.xml"):
            os.remove("classifier.xml")

        # SAVE NEW FILE
        clf.write("classifier.xml")

        # VERIFY FILE
        if (
            not os.path.exists("classifier.xml")
            or os.path.getsize("classifier.xml") == 0
        ):

            messagebox.showerror(
                "Error",
                "Classifier save failed"
            )

            return

        print(
            "Classifier Size:",
            os.path.getsize("classifier.xml")
        )

        messagebox.showinfo(
            "Success",
            "Training completed successfully!"
        )

    except Exception as e:

        print(e)

        messagebox.showerror(
            "Training Error",
            str(e)
        )

    finally:

        is_training = False

        b1.config(state="normal")

# def detect_face():

    global is_detecting

    if is_detecting:
        messagebox.showinfo(
            "Info",
            "Detection already running"
        )
        return

    if is_training:
        messagebox.showwarning(
            "Warning",
            "Training is in progress"
        )
        return

    if not os.path.exists("classifier.xml"):
        messagebox.showerror(
            "Error",
            "Please train the model first"
        )
        return

    def run_detection():

        global is_detecting

        is_detecting = True

        b2.config(state="disabled")

        try:

            faceCascade = cv2.CascadeClassifier(
                "haarcascade_frontalface_default.xml"
            )

            clf = cv2.face.LBPHFaceRecognizer_create()

            try:
                clf.read("classifier.xml")

            except:
                messagebox.showerror(
                    "Error",
                    "Classifier file corrupted.\nTrain again."
                )
                return

            video_capture = cv2.VideoCapture(0)

            if not video_capture.isOpened():
                messagebox.showerror(
                    "Error",
                    "Cannot access camera"
                )
                return

            video_capture.set(
                cv2.CAP_PROP_FRAME_WIDTH,
                640
            )

            video_capture.set(
                cv2.CAP_PROP_FRAME_HEIGHT,
                480
            )

            while True:

                ret, img = video_capture.read()

                if not ret:
                    break

                gray = cv2.cvtColor(
                    img,
                    cv2.COLOR_BGR2GRAY
                )

                faces = faceCascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=6,
                    minSize=(80, 80)
                )

                for (x, y, w, h) in faces:

                    face_roi = gray[y:y+h, x:x+w]

                    face_roi = cv2.resize(
                        face_roi,
                        (300, 300)
                    )

                    face_roi = cv2.equalizeHist(face_roi)

                    try:

                        id, pred = clf.predict(face_roi)

                        confidence = int(
                            100 * (1 - pred / 300)
                        )

                    except:
                        confidence = 0

                    name = "Unknown"

                    if confidence > 80:

                        try:

                            mydb = mysql.connector.connect(
                                host="localhost",
                                user="YOUR_USERNAME",
                                password="YOUR_PASSWORD",
                                database="face_recognizer"
                            )

                            mycursor = mydb.cursor()

                            query = """
                            SELECT Name
                            FROM my_table
                            WHERE id=%s
                            """

                            mycursor.execute(query, (id,))

                            result = mycursor.fetchone()

                            if result:
                                name = result[0]

                            mydb.close()

                        except:
                            name = "Database Error"

                        color = (0, 255, 0)

                        text = f"{name} ({confidence}%)"

                    else:

                        color = (0, 0, 255)

                        text = "Unknown"

                    cv2.rectangle(
                        img,
                        (x, y),
                        (x+w, y+h),
                        color,
                        2
                    )

                    cv2.putText(
                        img,
                        text,
                        (x, y-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        color,
                        2
                    )

                cv2.imshow(
                    "Face Recognition",
                    img
                )

                key = cv2.waitKey(1)

                if key == 13 or key == 27:
                    break

            video_capture.release()

            cv2.destroyAllWindows()

        finally:

            is_detecting = False

            b2.config(state="normal")

    threading.Thread(
        target=run_detection,
        daemon=True
    ).start()

def detect_face():

    global is_detecting

    if is_detecting:
        messagebox.showinfo(
            "Info",
            "Detection already running"
        )
        return

    if not os.path.exists("classifier.xml"):

        messagebox.showerror(
            "Error",
            "Please train the model first"
        )

        return

    def run_detection():

        global is_detecting

        is_detecting = True

        b2.config(state="disabled")

        try:

            faceCascade = cv2.CascadeClassifier(
                "haarcascade_frontalface_default.xml"
            )

            clf = cv2.face.LBPHFaceRecognizer_create()

            clf.read("classifier.xml")

            video_capture = cv2.VideoCapture(0)

            if not video_capture.isOpened():

                messagebox.showerror(
                    "Error",
                    "Cannot access camera"
                )

                return

            # Better speed
            video_capture.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            video_capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

            while True:

                ret, img = video_capture.read()

                if not ret:
                    break

                gray = cv2.cvtColor(
                    img,
                    cv2.COLOR_BGR2GRAY
                )

                faces = faceCascade.detectMultiScale(
                    gray,
                    scaleFactor=1.1,
                    minNeighbors=6,
                    minSize=(80, 80)
                )

                # MULTIPLE FACE LOOP
                for (x, y, w, h) in faces:

                    face_roi = gray[y:y+h, x:x+w]

                    face_roi = cv2.resize(
                        face_roi,
                        (200, 200)
                    )

                    face_roi = cv2.equalizeHist(face_roi)

                    try:

                        id, pred = clf.predict(face_roi)

                        confidence = int(
                            100 * (1 - pred / 300)
                        )

                    except:

                        confidence = 0

                    name = "Unknown"

                    # UNKNOWN PERSON
                    if confidence < 77:

                        color = (0, 0, 255)

                        text = "Unknown"

                    else:

                        try:

                            mydb = mysql.connector.connect(
                                host="localhost",
                                user="YOUR_USERNAME",
                                password="YOUR_PASSWORD",
                                database="face_recognizer"
                            )

                            mycursor = mydb.cursor()

                            query = """
                            SELECT Name
                            FROM my_table
                            WHERE id=%s
                            """

                            mycursor.execute(query, (id,))

                            result = mycursor.fetchone()

                            if result:

                                name = result[0]

                            mydb.close()

                        except:

                            name = "Unknown"

                        color = (0, 255, 0)

                        text = f"{name} ({confidence}%)"

                    # FACE BOX
                    cv2.rectangle(
                        img,
                        (x, y),
                        (x+w, y+h),
                        color,
                        3
                    )

                    # NAME LABEL BACKGROUND
                    cv2.rectangle(
                        img,
                        (x, y-40),
                        (x+w, y),
                        color,
                        -1
                    )

                    # NAME TEXT
                    cv2.putText(
                        img,
                        text,
                        (x+5, y-10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.8,
                        (255, 255, 255),
                        2
                    )

                cv2.imshow(
                    "Face Recognition",
                    img
                )

                key = cv2.waitKey(1)

                # ESC OR ENTER
                if key == 27 or key == 13:
                    break

            video_capture.release()

            cv2.destroyAllWindows()

        except Exception as e:

            print(e)

            messagebox.showerror(
                "Detection Error",
                str(e)
            )

        finally:

            is_detecting = False

            b2.config(state="normal")

    threading.Thread(
        target=run_detection,
        daemon=True
    ).start()

# =========================
# GENERATE DATASET
# =========================

def generate_dataset():

    if t1.get() == "" or t2.get() == "" or t3.get() == "":
        messagebox.showerror(
            "Error",
            "Please provide complete details"
        )
        return

    try:

        mydb =mysql.connector.connect(
            host="localhost",
            user="YOUR_USERNAME",
            password="YOUR_PASSWORD",
            database="face_recognizer"
        )

        mycursor = mydb.cursor()

        mycursor.execute("SELECT * FROM my_table")

        myresult = mycursor.fetchall()

        id = len(myresult) + 1

        sql = """
        INSERT INTO my_table(id, Name, Age, Address)
        VALUES(%s,%s,%s,%s)
        """

        val = (
            id,
            t1.get(),
            t2.get(),
            t3.get()
        )

        mycursor.execute(sql, val)

        mydb.commit()

    except Exception as e:
        messagebox.showerror("Database Error", str(e))
        return

    face_classifier = cv2.CascadeClassifier(
        "haarcascade_frontalface_default.xml"
    )

    cap = cv2.VideoCapture(0)

    img_id = 0

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        faces = face_classifier.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=8,
            minSize=(100, 100)
        )

        for (x, y, w, h) in faces:

            img_id += 1

            face = gray[y:y+h, x:x+w]

            face = cv2.resize(face, (300, 300))

            # Improve lighting normalization
            face = cv2.equalizeHist(face)

            file_name_path = f"data/user.{id}.{img_id}.jpg"

            cv2.imwrite(file_name_path, face)

            cv2.rectangle(
                frame,
                (x, y),
                (x+w, y+h),
                (0, 255, 0),
                2
            )

            cv2.putText(
                frame,
                f"Image {img_id}",
                (x, y-10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2
            )

        cv2.imshow("Generating Dataset", frame)

        # Slow down capture slightly
        cv2.waitKey(100)

        # Stop after 100 images
        if img_id >= 100:
            break

        # ENTER KEY
        if cv2.waitKey(1) == 13:
            break

    cap.release()
    cv2.destroyAllWindows()

    messagebox.showinfo(
        "Result",
        "Dataset generated successfully!"
    )

# =========================
# BUTTONS
# =========================

b1 = tk.Button(
    window,
    text="Train Data",
    font=("Algerian", 18),
    bg="orange",
    fg="red",
    command=lambda: threading.Thread(target=train_classifier).start()
)

b1.grid(column=0, row=4, pady=20)

b2 = tk.Button(
    window,
    text="Detect Face",
    font=("Algerian", 18),
    bg="gray",
    fg="white",
    command=detect_face
)

b2.grid(column=1, row=4)

b3 = tk.Button(
    window,
    text="Generate Dataset",
    font=("Algerian", 18),
    bg="pink",
    fg="black",
    command=lambda: threading.Thread(target=generate_dataset).start()
)

b3.grid(column=2, row=4)

window.mainloop()
