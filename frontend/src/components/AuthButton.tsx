import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface User {
	id: string;
	email: string;
	name: string | null;
	picture: string | null;
}

function AuthButton() {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const navigate = useNavigate();

	const checkAuthStatus = useCallback(async () => {
		try {
			const data = await api.get<{ authenticated: boolean; user: User }>("/auth/status");
			
			if (data?.authenticated && data?.user) {
				setUser(data.user);
			}
		} catch (error) {
			console.error("Auth check failed:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		checkAuthStatus();
	}, [checkAuthStatus]);

	const handleLogout = async () => {
		try {
			await api.post("/auth/logout", {});
			setUser(null);
			navigate("/login");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	const handleLogin = () => {
		window.location.href = `${import.meta.env.VITE_API_URL}/auth/google?service=AUTH`;
	};

	if (loading) {
		return <div>Loading...</div>;
	}

	if (user) {
		return (
			<div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2rem" }}>
				{user.picture && (
					<img
						src={user.picture}
						alt={user.name || "User"}
						style={{ width: 40, height: 40, borderRadius: "50%" }}
					/>
				)}
				{/* Display name only for privacy - avoid showing email */}
				<span>Welcome, {user.name || "User"}</span>
				<button onClick={handleLogout} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
					Logout
				</button>
			</div>
		);
	}

	return (
		<div style={{ marginBottom: "2rem" }}>
			<button onClick={handleLogin} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
				Login with Google
			</button>
		</div>
	);
}

export default AuthButton;
