package com.dokkit.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.dokkit.app.core.theme.DokkitTheme
import com.dokkit.app.data.auth.AuthRepository
import kotlinx.coroutines.launch

/**
 * Sign-in gate for the native client. This intentionally supports existing
 * accounts only; account creation remains governed by the web app's signup
 * policy. Auth/session state remains owned by AuthRepository.
 */
@Composable
fun AuthScreen(repository: AuthRepository) {
    val colors = DokkitTheme.colors
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Dokkit", style = androidx.compose.material3.MaterialTheme.typography.headlineLarge, color = colors.ink)
        Spacer(Modifier.height(8.dp))
        Text("Sign in to continue", color = colors.inkSoft)
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = email,
            onValueChange = { email = it; error = null },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            enabled = !busy,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            enabled = !busy,
        )

        error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = colors.danger)
        }
        Spacer(Modifier.height(18.dp))
        Button(
            onClick = {
                val cleanEmail = email.trim()
                if (cleanEmail.isEmpty() || password.isEmpty()) {
                    error = "Enter your email and password."
                } else {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            repository.signInWithEmailAndPassword(cleanEmail, password)
                        } catch (e: Exception) {
                            error = e.message?.takeIf(String::isNotBlank)
                                ?: "Could not sign in. Check your details and try again."
                        } finally {
                            busy = false
                        }
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !busy,
        ) {
            if (busy) {
                CircularProgressIndicator()
            } else {
                Text("Sign in")
            }
        }
    }
}
