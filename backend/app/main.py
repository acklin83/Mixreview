import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import admin, comments, projects, settings

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Mix Reaview", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin.router)
app.include_router(projects.router)
app.include_router(comments.router)
app.include_router(settings.router)

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/admin")
@app.get("/admin/{path:path}")
def admin_page(path: str = ""):
    return FileResponse(os.path.join(FRONTEND_DIR, "admin", "index.html"))


# Client share link page (must be after all /api and /admin routes)
@app.get("/{share_link}")
def client_page(share_link: str):
    return FileResponse(os.path.join(FRONTEND_DIR, "client", "index.html"))


# Serve static frontend files (js, css)
app.mount("/admin-static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "admin")), name="admin-static")
app.mount("/client-static", StaticFiles(directory=os.path.join(FRONTEND_DIR, "client")), name="client-static")
