#!/usr/bin/env python3
import requests

url = "http://localhost:8000/api/repositories/https%3A%2F%2Fgithub.com%2Fwunused%2Fpython-ast/branches"
response = requests.get(url)
print(f"Status: {response.status_code}")
print(f"Response: {response.json()}")
